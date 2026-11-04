import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/common";
import { brl, extractAdsInfo, fmtDateTime } from "@/lib/store";
import { logActivity } from "@/lib/audit";
import { confirmOrderManual } from "@/lib/orders-admin.functions";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Pedidos — Painel Admin" },
      { name: "description", content: "Pedidos da loja: status, busca, etapas de entrega e confirmação." },
    ],
  }),
  component: OrdersPage,
});

type Order = Tables<"orders">;

/** Origem da confirmação de pagamento ("gateway" = registros antigos, vindos da tela do PIX). */
const CONFIRM_LABEL: Record<string, string> = {
  webhook: "webhook",
  reconcile: "conferência automática",
  pix_screen: "tela do PIX",
  gateway: "tela do PIX",
  manual: "manual",
};

const STATUS = {
  paid: { l: "Pago", cls: "bg-green-100 text-green-700 border-green-200" },
  pending: { l: "Pendente", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  cancelled: { l: "Cancelado", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  refunded: { l: "Reembolsado", cls: "bg-red-100 text-red-700 border-red-200" },
} as const;
type St = keyof typeof STATUS;

/** Mesmas etapas da aba Rastreio e da página pública /rastreio. */
const STAGES = [
  { id: "waiting", label: "Aguardando envio", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "shipped", label: "Em transporte", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  { id: "delivered", label: "Entregue", cls: "bg-green-100 text-green-700 border-green-200" },
] as const;
type StageId = (typeof STAGES)[number]["id"];

const PAGE = 20;

// ---------- helpers ----------
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
const digits = (v: string) => v.replace(/\D/g, "");
const tr = (o: Order) => obj(o.tracking);
const codeOf = (o: Order) => str(tr(o)["tracking_code"]);
const orderCodeOf = (o: Order) => str(tr(o)["order_code"]);
const cpfOf = (o: Order) => str(obj(tr(o)["customer"])["cpf"]);
const shortId = (o: Order) => o.id.slice(0, 8).toUpperCase();
const stageOf = (o: Order): StageId => {
  const s = tr(o)["tracking_stage"];
  if (s === "delivered" || s === "shipped") return s;
  return codeOf(o) ? "shipped" : "waiting";
};
const fmtCpf = (c: string) => {
  const d = digits(c);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c;
};
const addressOf = (o: Order) => {
  const a = obj(tr(o)["address"]);
  const get = (...k: string[]) => k.map((x) => str(a[x])).find(Boolean) ?? "";
  const line1 = [get("street", "rua", "logradouro"), get("number", "numero")].filter(Boolean).join(", ");
  const parts = [
    line1,
    get("complement", "complemento"),
    get("neighborhood", "bairro"),
    [get("city", "cidade"), get("state", "uf", "estado")].filter(Boolean).join("/"),
    get("cep", "zip", "postal_code"),
  ].filter(Boolean);
  return parts.join(" — ");
};
const shippingOf = (o: Order) => {
  const sh = obj(tr(o)["shipping"]);
  const m = str(sh["method"]);
  const price = typeof sh["price_cents"] === "number" ? (sh["price_cents"] as number) : 0;
  const name = m === "jadlog" ? "Jadlog" : m === "gratis" ? "Frete Grátis" : m ? m.toUpperCase() : "SEDEX";
  return price ? `${name} (${brl(price)})` : `${name} (grátis)`;
};
const gatewayOf = (o: Order) => {
  const p = obj(tr(o)["payment"]);
  return { gateway: str(p["gateway"]) || "PIX", tx: str(p["transaction_id"]) };
};

/** Datas no fuso de Brasília (UTC-3). */
const ymdBR = (offsetDays = 0) =>
  new Date(Date.now() - 3 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
const PRESETS = [
  { id: "today", l: "Hoje", from: () => ymdBR(0) },
  { id: "7", l: "7 dias", from: () => ymdBR(-6) },
  { id: "30", l: "30 dias", from: () => ymdBR(-29) },
  { id: "all", l: "Todos", from: () => "" },
] as const;

// ---------- page ----------
function OrdersPage() {
  const [status, setStatus] = useState<"all" | St>("all");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(ymdBR(-29));
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["orders", from, to],
    refetchInterval: 30_000,
    queryFn: async () => {
      let qb = supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(5000);
      if (from) qb = qb.gte("created_at", `${from}T00:00:00-03:00`);
      if (to) qb = qb.lte("created_at", `${to}T23:59:59.999-03:00`);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const all = q.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length, paid: 0, pending: 0, cancelled: 0, refunded: 0 };
    for (const o of all) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sd = digits(s);
    return all.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!s) return true;
      const text = `${o.customer_name ?? ""} ${o.customer_email ?? ""} ${codeOf(o)} ${orderCodeOf(o)} ${shortId(o)} ${o.coupon_code ?? ""}`.toLowerCase();
      if (text.includes(s)) return true;
      if (sd.length >= 3) {
        if (digits(o.customer_phone ?? "").includes(sd)) return true;
        if (digits(cpfOf(o)).includes(sd)) return true;
      }
      return false;
    });
  }, [all, status, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const paidSum = filtered.filter((o) => o.status === "paid").reduce((s, o) => s + o.total_cents, 0);

  const applySearch = () => {
    setSearch(draft);
    setPage(0);
  };
  const preset = (id: (typeof PRESETS)[number]["id"]) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setFrom(p.from());
    setTo("");
    setPage(0);
  };
  const activePreset = !to ? PRESETS.find((p) => p.from() === from)?.id : undefined;

  return (
    <AppShell
      title="Pedidos"
      actions={
        <Button size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Package className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Pedidos</h2>
      </div>

      <div className="mb-4 space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Chip on={status === "all"} onClick={() => { setStatus("all"); setPage(0); }}>
            Todos ({counts.all})
          </Chip>
          {(Object.keys(STATUS) as St[]).map((k) => (
            <Chip key={k} on={status === k} onClick={() => { setStatus(k); setPage(0); }}>
              {STATUS[k].l}s ({counts[k] ?? 0})
            </Chip>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Nome, telefone, e-mail, CPF, nº do pedido ou código (BHY…)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            aria-label="Buscar pedido"
          />
          <div className="flex gap-2">
            <Button onClick={applySearch}>
              <Search className="h-4 w-4" /> Pesquisar
            </Button>
            {(search || draft) && (
              <Button variant="outline" onClick={() => { setDraft(""); setSearch(""); setPage(0); }}>
                <X className="h-4 w-4" /> Limpar
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-muted-foreground">
            De
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="mt-1 h-9 w-40" />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Até
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="mt-1 h-9 w-40" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Chip key={p.id} on={activePreset === p.id} onClick={() => preset(p.id)}>
                {p.l}
              </Chip>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          <b className="text-foreground">{filtered.length}</b> pedido{filtered.length === 1 ? "" : "s"} encontrado
          {filtered.length === 1 ? "" : "s"} · pagos somam <b className="text-green-700">{brl(paidSum)}</b>
        </p>
      </div>

      {q.isError && <ErrorState />}
      <div className="overflow-x-auto rounded-xl border bg-card">
        {q.isLoading ? (
          <Skeleton className="h-64" />
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-3" />
                <th className="px-3 py-3 text-left">Pedido / Rastreio</th>
                <th className="px-3 py-3 text-left">Cliente</th>
                <th className="px-3 py-3 text-left">Valor</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Criado / Pago</th>
                <th className="px-3 py-3 text-left">Etapa da entrega</th>
                <th className="px-3 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <OrderRow key={o.id} order={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {cur + 1} de {pages}
          </span>
          <Button variant="outline" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </AppShell>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
        on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- row ----------
function OrderRow({ order, open, onToggle }: { order: Order; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<StageId>(stageOf(order));
  const [busy, setBusy] = useState<null | "stage" | "check" | "confirm" | "cancel">(null);
  const [copied, setCopied] = useState<string | null>(null);
  const st = STATUS[order.status as St] ?? STATUS.pending;
  const idx = STAGES.findIndex((s) => s.id === stage);
  const isPaid = order.status === "paid";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["tracking-orders"] });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  async function saveStage() {
    setBusy("stage");
    const { error } = await supabase
      .from("orders")
      .update({ tracking: { ...tr(order), tracking_stage: stage, tracking_updated_at: new Date().toISOString() } })
      .eq("id", order.id);
    setBusy(null);
    if (error) return toast.error("Não foi possível salvar a etapa.");
    await logActivity("tracking.update");
    toast.success("Etapa salva — a cliente já vê em Rastrear pedido.");
    refresh();
  }

  async function checkGateway() {
    setBusy("check");
    try {
      const r = await fetch(`/api/public/pix-status?id=${encodeURIComponent(order.id)}&src=admin`);
      const j = (await r.json().catch(() => ({}))) as { status?: string };
      if (j.status === "paid") toast.success("Pagamento confirmado pelo gateway!");
      else toast.info(`Gateway: ${j.status ?? "sem resposta"} — ainda não pago.`);
      refresh();
    } catch {
      toast.error("Não foi possível consultar o gateway.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmManual() {
    if (!window.confirm(`Confirmar manualmente o pagamento de ${brl(order.total_cents)} de ${order.customer_name ?? "cliente"}?`)) return;
    setBusy("confirm");
    try {
      const r = await confirmOrderManual({ data: { id: order.id } });
      toast.success(r.already ? "Esse pedido já estava pago." : "Pagamento confirmado manualmente.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancelar este pedido pendente?")) return;
    setBusy("cancel");
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id).eq("status", "pending");
    setBusy(null);
    if (error) return toast.error("Não foi possível cancelar.");
    toast.success("Pedido cancelado.");
    refresh();
  }

  const code = codeOf(order);
  return (
    <Fragment>
      <tr className={`border-t align-top ${open ? "bg-muted/40" : ""}`}>
        <td className="px-2 py-3">
          <button type="button" onClick={onToggle} aria-label={open ? "Recolher detalhes" : "Ver detalhes"} className="text-slate-500 hover:text-slate-900">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-primary">#{shortId(order)}</span>
            <CopyBtn on={copied === shortId(order)} onClick={() => void copy(shortId(order))} label="Copiar nº do pedido" />
          </div>
          {orderCodeOf(order) && (
            <div className="mt-0.5 flex items-center gap-1 font-mono text-xs font-semibold text-success">
              {orderCodeOf(order)}
              <CopyBtn on={copied === orderCodeOf(order)} onClick={() => void copy(orderCodeOf(order))} label="Copiar código de rastreio da loja" />
            </div>
          )}
          {code ? (
            <div className="mt-0.5 flex items-center gap-1 font-mono text-xs">
              {code}
              <CopyBtn on={copied === code} onClick={() => void copy(code)} label="Copiar código de rastreio" />
            </div>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{isPaid ? "sem código Correios/Jadlog" : "—"}</p>
          )}
        </td>
        <td className="px-3 py-3">
          <p className="font-semibold">{order.customer_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{order.customer_phone ?? order.customer_email ?? ""}</p>
        </td>
        <td className="px-3 py-3 font-semibold">{brl(order.total_cents)}</td>
        <td className="px-3 py-3">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.l}</span>
          {order.confirmed_by && isPaid && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{CONFIRM_LABEL[order.confirmed_by] ?? "tela do PIX"}</p>
          )}
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground">
          {fmtDateTime(order.created_at)}
          {order.paid_at && <p className="font-semibold text-green-700">pago {fmtDateTime(order.paid_at)}</p>}
        </td>
        <td className="px-3 py-3">
          {isPaid ? (
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" aria-label="Etapa anterior" disabled={idx <= 0} onClick={() => setStage(STAGES[idx - 1].id)} className="rounded border p-1 disabled:opacity-30">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as StageId)}
                aria-label={`Etapa do pedido ${shortId(order)}`}
                className={`h-8 rounded-full border px-2 text-xs font-bold ${STAGES[idx].cls}`}
              >
                {STAGES.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i + 1}/{STAGES.length} · {s.label}
                  </option>
                ))}
              </select>
              <button type="button" aria-label="Próxima etapa" disabled={idx >= STAGES.length - 1} onClick={() => setStage(STAGES[idx + 1].id)} className="rounded border p-1 disabled:opacity-30">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <Button size="sm" className="h-8" disabled={stage === stageOf(order) || busy !== null} onClick={() => void saveStage()}>
                {busy === "stage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">após o pagamento</span>
          )}
        </td>
        <td className="px-3 py-3">
          {order.status === "pending" ? (
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={() => void checkGateway()}>
                {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Verificar no gateway
              </Button>
              <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" disabled={busy !== null} onClick={() => void confirmManual()}>
                {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Confirmar manual
              </Button>
              <button type="button" disabled={busy !== null} onClick={() => void cancel()} className="text-xs font-semibold text-red-600 hover:underline">
                Cancelar pedido
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t bg-muted/40">
          <td colSpan={8} className="px-4 pb-4 pt-2">
            <Details order={order} onSaved={refresh} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function CopyBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="text-slate-400 hover:text-slate-700" title={label} aria-label={label}>
      {on ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ---------- expanded details ----------
function Details({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const [name, setName] = useState(order.customer_name ?? "");
  const [phone, setPhone] = useState(order.customer_phone ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);
  const items = Array.isArray(order.items) ? (order.items as { name?: string; qty?: number; price_cents?: number }[]) : [];
  const ads = extractAdsInfo(order.tracking);
  const t = tr(order);
  const g = gatewayOf(order);
  const coupon = order.coupon_code || str(obj(t["coupon"])["code"]) || str(t["coupon"]);
  const dirty = name !== (order.customer_name ?? "") || phone !== (order.customer_phone ?? "") || notes !== (order.notes ?? "");

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .update({ customer_name: name || null, customer_phone: phone || null, notes: notes || null })
      .eq("id", order.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar.");
    toast.success("Pedido atualizado.");
    onSaved();
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Box title="Cliente">
        <Line k="Nome" v={order.customer_name} />
        <Line k="E-mail" v={order.customer_email} />
        <Line k="Telefone" v={order.customer_phone} />
        <Line k="CPF" v={cpfOf(order) ? fmtCpf(cpfOf(order)) : ""} />
      </Box>
      <Box title="Pagamento e entrega">
        <Line k="Criado" v={fmtDateTime(order.created_at)} />
        <Line k="Pago" v={order.paid_at ? fmtDateTime(order.paid_at) : ""} />
        <Line k="Gateway" v={g.gateway} />
        <Line k="Transação" v={g.tx} mono />
        <Line k="Frete" v={shippingOf(order)} />
        <Line k="Endereço" v={addressOf(order)} />
        {coupon && <Line k="Cupom" v={coupon} />}
      </Box>
      <Box title="Origem (UTMs)">
        <Line k="Fonte" v={ads.source} />
        <Line k="Campanha" v={ads.campaign} />
        <Line k="Conjunto" v={ads.adset} />
        <Line k="Anúncio" v={ads.ad} />
        <Line k="Posicionamento" v={ads.placement} />
      </Box>

      <Box title="Itens" className="md:col-span-1">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {items.map((i, k) => (
              <li key={k}>
                <b>{i.qty ?? 1}x</b> {i.name ?? "Produto"}
                {typeof i.price_cents === "number" && <span className="text-muted-foreground"> · {brl(i.price_cents)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Box>
      <Box title="Editar" className="md:col-span-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome" className="h-9" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" aria-label="Telefone" className="h-9" />
        </div>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações internas" aria-label="Observações" className="mt-2 min-h-[60px]" />
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </div>
      </Box>
    </div>
  );
}

function Box({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border bg-card p-3 ${className}`}>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Line({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  return (
    <p className="flex gap-2 text-xs leading-6">
      <span className="w-24 shrink-0 text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-words font-medium ${mono ? "font-mono" : ""}`}>{v || "—"}</span>
    </p>
  );
}
