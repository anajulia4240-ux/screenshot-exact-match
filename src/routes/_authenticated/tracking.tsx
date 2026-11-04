import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Save, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/common";
import { brl, fmtDateTime } from "@/lib/store";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/tracking")({
  head: () => ({
    meta: [
      { title: "Rastreio — Painel Admin" },
      { name: "description", content: "Códigos de rastreio e etapas de entrega dos pedidos pagos." },
    ],
  }),
  component: TrackingPage,
});

/** Etapas reais da entrega (definidas manualmente no painel). */
const STAGES = [
  { id: "waiting", label: "Aguardando envio", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "shipped", label: "Em transporte", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  { id: "delivered", label: "Entregue", cls: "bg-green-100 text-green-700 border-green-200" },
] as const;
type StageId = (typeof STAGES)[number]["id"];

type Row = {
  id: string;
  created_at: string;
  paid_at: string | null;
  total_cents: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  items: unknown;
  tracking: unknown;
};

const t = (o: Row) => (o.tracking && typeof o.tracking === "object" ? (o.tracking as Record<string, unknown>) : {});
const codeOf = (o: Row) => (typeof t(o)["tracking_code"] === "string" ? (t(o)["tracking_code"] as string) : "");
const stageOf = (o: Row): StageId => {
  const s = t(o)["tracking_stage"];
  if (s === "delivered" || s === "shipped") return s;
  return codeOf(o) ? "shipped" : "waiting";
};
const carrierOf = (o: Row) => {
  const ship = t(o)["shipping"];
  const m = ship && typeof ship === "object" ? (ship as Record<string, unknown>)["method"] : null;
  return m === "jadlog" ? "Jadlog" : m === "gratis" ? "Correios/Jadlog" : "SEDEX";
};
const orderCodeOf = (o: Row) => (typeof t(o)["order_code"] === "string" ? (t(o)["order_code"] as string) : "");
const shortId = (o: Row) => o.id.slice(0, 8).toUpperCase();

function TrackingPage() {
  const [filter, setFilter] = useState<"all" | StageId>("all");
  const [query, setQuery] = useState("");
  const q = useQuery({
    queryKey: ["tracking-orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, paid_at, total_cents, customer_name, customer_phone, customer_email, items, tracking")
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];
  const counts: Record<string, number> = { all: rows.length };
  for (const s of STAGES) counts[s.id] = 0;
  for (const o of rows) counts[stageOf(o)] = (counts[stageOf(o)] ?? 0) + 1;

  const s = query.trim().toLowerCase();
  const filtered = rows.filter((o) => {
    if (filter !== "all" && stageOf(o) !== filter) return false;
    if (!s) return true;
    return `${codeOf(o)} ${orderCodeOf(o)} ${o.customer_name ?? ""} ${o.customer_phone ?? ""} ${o.customer_email ?? ""} ${shortId(o)}`
      .toLowerCase()
      .includes(s);
  });

  return (
    <AppShell
      title="Rastreio"
      actions={
        <Button size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Truck className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Rastreio</h2>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Cada pedido pago ganha na hora um código da loja (BHY…), que a cliente usa em Rastrear pedido. Quando postar, cole aqui o código dos Correios/Jadlog e escolha a etapa. A cliente vê exatamente isso em{" "}
        <b className="text-foreground">Rastrear pedido</b> (pelo CPF ou pelo código).
      </p>

      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterBtn on={filter === "all"} onClick={() => setFilter("all")}>
            Todos ({counts.all})
          </FilterBtn>
          {STAGES.map((st) => (
            <FilterBtn key={st.id} on={filter === st.id} onClick={() => setFilter(st.id)}>
              {st.label} ({counts[st.id] ?? 0})
            </FilterBtn>
          ))}
        </div>
        <Input
          placeholder="Buscar por código, nome, telefone, e-mail ou nº do pedido…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar pedido"
        />
      </div>

      {q.isError && <ErrorState />}
      <div className="overflow-x-auto rounded-xl border bg-card">
        {q.isLoading ? (
          <Skeleton className="h-48" />
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum pedido pago encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Pedido</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Pago em</th>
                <th className="px-4 py-3 text-left">Valor</th>
                <th className="px-4 py-3 text-left">Código de rastreio</th>
                <th className="px-4 py-3 text-left">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <TrackingRow key={o.id} order={o} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}

function FilterBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

function TrackingRow({ order }: { order: Row }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(codeOf(order));
  const [stage, setStage] = useState<StageId>(stageOf(order));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const dirty = code.trim().toUpperCase() !== codeOf(order) || stage !== stageOf(order);
  const items = Array.isArray(order.items) ? (order.items as { name?: string; qty?: number }[]) : [];
  const meta = STAGES.find((x) => x.id === stage)!;
  const idx = STAGES.findIndex((x) => x.id === stage);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast.success("Copiado");
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  async function save() {
    const clean = code.trim().toUpperCase();
    const nextStage: StageId = clean && stage === "waiting" ? "shipped" : stage;
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .update({
        tracking: {
          ...t(order),
          tracking_code: clean || null,
          tracking_stage: nextStage,
          tracking_updated_at: new Date().toISOString(),
        },
      })
      .eq("id", order.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o rastreio.");
      return;
    }
    setStage(nextStage);
    await logActivity("tracking.update");
    toast.success("Rastreio salvo — a cliente já vê a atualização.");
    void qc.invalidateQueries({ queryKey: ["tracking-orders"] });
  }

  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-primary">#{shortId(order)}</span>
          <button
            type="button"
            onClick={() => void copy(shortId(order))}
            className="text-slate-400 hover:text-slate-700"
            title="Copiar nº do pedido"
            aria-label="Copiar nº do pedido"
          >
            {copied === shortId(order) ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        {orderCodeOf(order) && <p className="mt-0.5 font-mono text-xs font-semibold text-success">{orderCodeOf(order)}</p>}
        <p className="mt-0.5 max-w-[220px] text-[11px] text-muted-foreground">
          {items.map((i) => `${i.qty ?? 1}x ${i.name ?? "Produto"}`).join(", ")}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold">{order.customer_name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{order.customer_phone ?? order.customer_email ?? ""}</p>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(order.paid_at)}</td>
      <td className="px-4 py-3 font-semibold">{brl(order.total_cents)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={`Código ${carrierOf(order)}`}
            aria-label={`Código de rastreio do pedido ${shortId(order)}`}
            className="h-9 w-44 font-mono text-xs"
          />
          {codeOf(order) && (
            <button
              type="button"
              onClick={() => void copy(codeOf(order))}
              className="text-slate-400 hover:text-slate-700"
              title="Copiar código"
              aria-label="Copiar código de rastreio"
            >
              {copied === codeOf(order) ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{carrierOf(order)}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as StageId)}
            aria-label={`Etapa do pedido ${shortId(order)}`}
            className={`h-9 rounded-full border px-2 text-xs font-bold ${meta.cls}`}
          >
            {STAGES.map((st, i) => (
              <option key={st.id} value={st.id}>
                {i + 1}/{STAGES.length} · {st.label}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()} className="h-9">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <a
            href="/rastreio"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            Ver página <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <span className="sr-only">Etapa {idx + 1}</span>
      </td>
    </tr>
  );
}
