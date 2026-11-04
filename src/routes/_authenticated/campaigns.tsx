import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RefreshCw, Search, Target, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/common";
import { brl, extractAdsInfo, fmtDateTime, startOfDayBR } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Vendas por campanha — Painel Admin" },
      { name: "description", content: "Leads, PIX gerados, vendas e receita por campanha." },
    ],
  }),
  component: CampaignSalesPage,
});

type PeriodId = "today" | "yesterday" | "7d" | "30d" | "all";
const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "all", label: "Tudo" },
];

/** Janela do período em ISO (fuso de Brasília); null = todo o histórico. */
function periodBounds(p: PeriodId): { start: string; end: string | null } | null {
  switch (p) {
    case "today":
      return { start: startOfDayBR(0), end: null };
    case "yesterday":
      return { start: startOfDayBR(1), end: startOfDayBR(0) };
    case "7d":
      return { start: startOfDayBR(6), end: null };
    case "30d":
      return { start: startOfDayBR(29), end: null };
    default:
      return null;
  }
}

const RANK_STYLE = [
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-slate-100 text-slate-600 border-slate-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];

const NO_CAMPAIGN = "Sem campanha";

type OrderRow = {
  id: string;
  created_at: string;
  paid_at: string | null;
  status: string;
  total_cents: number;
  customer_name: string | null;
  customer_phone: string | null;
  lead_id: string | null;
  tracking: unknown;
};
type LeadRow = {
  id: string;
  created_at: string;
  name: string;
  phone: string | null;
  utm_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
};

type Stat = { campaign: string; origin: string; leads: number; pix: number; paid: number; revenue: number };

function CampaignSalesPage() {
  const [period, setPeriod] = useState<PeriodId>("today");
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["campaign-sales", period],
    refetchInterval: 30_000,
    queryFn: async () => {
      const b = periodBounds(period);
      let oq = supabase
        .from("orders")
        .select("id, created_at, paid_at, status, total_cents, customer_name, customer_phone, lead_id, tracking")
        .order("created_at", { ascending: false })
        .limit(2000);
      let lq = supabase
        .from("leads")
        .select("id, created_at, name, phone, utm_campaign, utm_source, utm_medium")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (b) {
        oq = oq.gte("created_at", b.start);
        lq = lq.gte("created_at", b.start);
        if (b.end) {
          oq = oq.lt("created_at", b.end);
          lq = lq.lt("created_at", b.end);
        }
      }
      const [o, l] = await Promise.all([oq, lq]);
      if (o.error) throw o.error;
      if (l.error) throw l.error;
      return { orders: (o.data ?? []) as OrderRow[], leads: (l.data ?? []) as LeadRow[] };
    },
  });

  const orders = data.data?.orders ?? [];
  const leads = data.data?.leads ?? [];

  // Campanha de cada lead (UTMs do primeiro acesso) e de cada pedido (UTMs do checkout; senão, do lead).
  const leadInfo = useMemo(() => {
    const m = new Map<string, { campaign: string; origin: string }>();
    for (const l of leads) {
      const a = extractAdsInfo({ utm_campaign: l.utm_campaign, utm_source: l.utm_source, utm_medium: l.utm_medium });
      m.set(l.id, { campaign: a.campaign ?? NO_CAMPAIGN, origin: a.source ?? "—" });
    }
    return m;
  }, [leads]);

  const orderInfo = (o: OrderRow) => {
    const a = extractAdsInfo(o.tracking);
    const fromLead = o.lead_id ? leadInfo.get(o.lead_id) : undefined;
    return {
      campaign: a.campaign ?? (fromLead && fromLead.campaign !== NO_CAMPAIGN ? fromLead.campaign : NO_CAMPAIGN),
      origin: a.source ?? fromLead?.origin ?? "—",
      adset: a.adset,
      ad: a.ad,
    };
  };

  const stats = useMemo(() => {
    const by = new Map<string, Stat>();
    const get = (campaign: string, origin: string) => {
      let s = by.get(campaign);
      if (!s) {
        s = { campaign, origin, leads: 0, pix: 0, paid: 0, revenue: 0 };
        by.set(campaign, s);
      }
      if (s.origin === "—" && origin !== "—") s.origin = origin;
      return s;
    };
    for (const l of leads) {
      const i = leadInfo.get(l.id)!;
      get(i.campaign, i.origin).leads++;
    }
    for (const o of orders) {
      const i = orderInfo(o);
      const s = get(i.campaign, i.origin);
      s.pix++;
      if (o.status === "paid") {
        s.paid++;
        s.revenue += o.total_cents;
      }
    }
    return [...by.values()].sort((a, b) => b.revenue - a.revenue || b.paid - a.paid || b.pix - a.pix || b.leads - a.leads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, leads, leadInfo]);

  const q = query.trim().toLowerCase();
  const visible = stats.filter((s) => !q || `${s.campaign} ${s.origin}`.toLowerCase().includes(q));
  const total = visible.reduce(
    (a, s) => ({ leads: a.leads + s.leads, pix: a.pix + s.pix, paid: a.paid + s.paid, revenue: a.revenue + s.revenue }),
    { leads: 0, pix: 0, paid: 0, revenue: 0 },
  );
  const totalConv = total.pix > 0 ? Math.round((total.paid / total.pix) * 100) : 0;
  const ticket = total.paid > 0 ? Math.round(total.revenue / total.paid) : 0;
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";

  const campaignOrders = campaign ? orders.filter((o) => orderInfo(o).campaign === campaign) : [];
  const campaignLeads = campaign ? leads.filter((l) => leadInfo.get(l.id)?.campaign === campaign) : [];

  return (
    <AppShell
      title="Vendas por campanha"
      actions={
        <Button size="sm" variant="outline" onClick={() => void data.refetch()} disabled={data.isFetching}>
          <RefreshCw className={`h-4 w-4 ${data.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-pink-600" aria-hidden />
            <h2 className="text-xl font-bold">Vendas por campanha</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              ao vivo
            </span>
          </div>
          {campaign && (
            <button
              type="button"
              onClick={() => setCampaign(null)}
              className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground transition hover:bg-muted/70"
            >
              ✕ Voltar às campanhas
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Período" className="inline-flex w-fit rounded-lg border bg-muted/40 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => {
                  setPeriod(p.id);
                  setCampaign(null);
                }}
                className={`rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${
                  period === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="relative lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Buscar campanha</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar campanha ou origem (ex.: CAMP4, facebook)"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        {data.isError && <ErrorState />}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Leads" value={String(total.leads)} />
          <Kpi label="PIX gerados" value={String(total.pix)} cls="text-amber-600" />
          <Kpi label="Vendas pagas" value={String(total.paid)} cls="text-emerald-600" />
          <Kpi label="Receita" value={brl(total.revenue)} cls="text-emerald-700" />
          <Kpi label="Conversão PIX" value={`${totalConv}%`} cls="text-sky-600" />
          <Kpi label="Ticket médio" value={brl(ticket)} />
        </div>

        {data.isLoading ? (
          <Skeleton className="h-48" />
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            {stats.length === 0
              ? `Nenhuma campanha com atividade (${periodLabel.toLowerCase()}).`
              : "Nenhuma campanha encontrada nessa busca."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((s, i) => {
              const active = campaign === s.campaign;
              const conv = s.pix > 0 ? Math.round((s.paid / s.pix) * 100) : 0;
              return (
                <button
                  key={s.campaign}
                  type="button"
                  onClick={() => setCampaign(active ? null : s.campaign)}
                  aria-pressed={active}
                  className={`rounded-xl border p-3.5 text-left transition ${
                    active
                      ? "border-pink-400 bg-pink-50 shadow-md ring-1 ring-pink-200"
                      : "bg-card shadow-sm hover:border-pink-200 hover:bg-pink-50/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                            RANK_STYLE[i] ?? "border-transparent bg-muted text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="truncate text-sm font-extrabold" title={s.campaign}>
                          {s.campaign}
                        </span>
                      </div>
                      <div className="truncate pl-6 text-[11px] font-semibold text-muted-foreground">{s.origin}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-emerald-700">{brl(s.revenue)}</div>
                      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">receita</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                    <Mini value={s.leads} label="leads" cls="text-slate-700" />
                    <Mini value={s.pix} label="pix" cls="text-amber-600" />
                    <Mini value={s.paid} label="vendas" cls="text-emerald-600" />
                    <Mini value={`${conv}%`} label="conv." cls="text-foreground" />
                  </div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${conv}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {campaign ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-pink-600" aria-hidden />
              <div className="truncate text-sm font-bold">
                Pedidos e leads de <span className="text-pink-600">{campaign}</span>
                <span className="ml-1 font-semibold text-muted-foreground">· {periodLabel}</span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              {campaignOrders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum PIX gerado por essa campanha no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="hidden px-3 py-2 md:table-cell">Conjunto • Anúncio</th>
                      <th className="px-3 py-2">Criado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {campaignOrders.map((o) => {
                      const i = orderInfo(o);
                      const paid = o.status === "paid";
                      return (
                        <tr key={o.id}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{o.customer_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                          </td>
                          <td className="px-3 py-2 font-semibold">{brl(o.total_cents)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                paid ? "bg-emerald-100 text-emerald-700" : o.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {paid ? "Pago" : o.status === "pending" ? "PIX gerado" : o.status === "cancelled" ? "Cancelado" : o.status}
                            </span>
                          </td>
                          <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
                            {[i.adset, i.ad].filter(Boolean).join(" • ") || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">{fmtDateTime(o.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {campaignLeads.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Leads da campanha ({campaignLeads.length})
                </p>
                <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {campaignLeads.slice(0, 60).map((l) => (
                    <li key={l.id} className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1">
                      <span className="truncate">{l.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(l.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          visible.length > 0 && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-5 text-center text-sm text-muted-foreground">
              Clique em uma campanha para ver os pedidos e leads dela — com as mesmas UTMs de Pedidos/Utmify.
            </div>
          )
        )}
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, cls = "text-foreground" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-black ${cls}`}>{value}</div>
    </div>
  );
}

function Mini({ value, label, cls }: { value: number | string; label: string; cls: string }) {
  return (
    <div>
      <div className={`text-sm font-black ${cls}`}>{value}</div>
      <div className="text-[9px] font-bold uppercase text-slate-400">{label}</div>
    </div>
  );
}
