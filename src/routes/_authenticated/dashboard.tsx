import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, CreditCard, MousePointerClick, QrCode, RefreshCw, RotateCcw, ShoppingCart, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Kpi, Section } from "@/components/admin/common";
import { brl, fetchAllEvents, startOfDayBR } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Ao vivo — Painel Admin" }, { name: "description", content: "KPIs do dia, funil e visitantes online agora." }] }),
  component: LivePage,
});

const POLL_MS = 120_000;

const STAGES: { key: string; label: string; types: string[] }[] = [
  { key: "clicks", label: "Cliques / produtos vistos", types: ["click", "product_view"] },
  { key: "cart", label: "Adicionou ao carrinho", types: ["add_to_cart"] },
  { key: "ic", label: "Checkout aberto (IC)", types: ["checkout_opened"] },
  { key: "filling", label: "Preenchendo checkout", types: ["checkout_filling"] },
  { key: "pix", label: "PIX gerado", types: ["pix_generated"] },
  { key: "purchase", label: "Compra", types: ["purchase"] },
];

function useLive() {
  return useQuery({
    queryKey: ["live"],
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const since = startOfDayBR();
      const [events, orders, online] = await Promise.all([
        fetchAllEvents(since),
        supabase.from("orders").select("status,total_cents").gte("created_at", since).limit(1000),
        supabase.from("sessions").select("id,current_page,last_seen_at,lead_id,leads(name)").gte("last_seen_at", new Date(Date.now() - 5 * 60_000).toISOString()).order("last_seen_at", { ascending: false }).limit(200),
      ]);
      if (orders.error) throw orders.error;
      if (online.error) throw online.error;
      return { events, orders: orders.data ?? [], online: online.data ?? [], at: new Date() };
    },
  });
}

function LivePage() {
  const qc = useQueryClient();
  const live = useLive();
  const reset = useMutation({
    mutationFn: async (types: string[]) => {
      const { error } = await supabase.from("events").delete().in("type", types).gte("created_at", startOfDayBR());
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Etapa zerada."); qc.invalidateQueries({ queryKey: ["live"] }); },
    onError: () => toast.error("Não foi possível zerar a etapa."),
  });

  const d = live.data;
  const count = (types: string[]) => d?.events.filter((e) => types.includes(e.type)).length ?? 0;
  const fillingLeads = new Set(d?.events.filter((e) => e.type === "checkout_filling").map((e) => e.lead_id ?? e.session_id)).size;
  const sum = (st?: string) => (d?.orders ?? []).filter((o) => !st || o.status === st).reduce((a, o) => a + o.total_cents, 0);
  const n = (st: string) => (d?.orders ?? []).filter((o) => o.status === st).length;
  const funnel = STAGES.map((s) => ({ ...s, value: count(s.types) }));
  const top = funnel[0]?.value ?? 0;
  const max = Math.max(1, ...funnel.map((f) => f.value));

  const pages = new Map<string, number>();
  d?.events.forEach((e) => e.page && pages.set(e.page, (pages.get(e.page) ?? 0) + 1));
  const topPages = [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const actions = (
    <>
      <span className="hidden text-xs text-muted-foreground sm:inline">{d ? `Atualizado às ${d.at.toLocaleTimeString("pt-BR")}` : ""}</span>
      <Button size="sm" variant="outline" onClick={() => live.refetch()} disabled={live.isFetching}>
        <RefreshCw className={live.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
      </Button>
    </>
  );

  return (
    <AppShell title="Ao vivo" actions={actions}>
      <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
        Modo de Segurança Ativo: travas contra falhas de renderização.
      </div>
      {live.isError && <ErrorState />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {live.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />) : (
          <>
            <Kpi icon={MousePointerClick} label="Cliques" value={String(count(["click", "product_view"]))} hint="Topo de funil" />
            <Kpi icon={ShoppingCart} label="IC (Init. checkout)" value={String(count(["checkout_opened"]))} tone="chart-2" hint="Compare com Utmify/Meta" />
            <Kpi icon={CreditCard} label="Checkouts" value={String(fillingLeads)} tone="chart-3" hint="Leads com dados preenchidos" />
            <Kpi icon={QrCode} label="PIX gerado" value={brl(sum())} tone="chart-4" hint={`${d?.orders.length ?? 0} pedidos`} />
            <Kpi icon={Wallet} label="Receita (pago)" value={brl(sum("paid"))} tone="chart-5" hint={`${n("paid")} pedidos`} />
            <Kpi icon={Clock} label="PIX pendente" value={brl(sum("pending"))} tone="destructive" hint={`${n("pending")} pedidos`} />
          </>
        )}
      </div>

      <Section title="Funil de etapas — hoje" className="mt-4">
        {live.isLoading ? <Skeleton className="h-48" /> : (
          <ul className="space-y-2.5">
            {funnel.map((f, i) => (
              <li key={f.key} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 truncate sm:w-56">{f.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(f.value / max) * 100}%` }} />
                </div>
                <span className="w-12 text-right font-medium tabular">{f.value}</span>
                <span className="w-12 text-right text-xs text-muted-foreground tabular">{top > 0 && i > 0 ? `${((f.value / top) * 100).toFixed(0)}%` : ""}</span>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7" aria-label={`Zerar ${f.label}`}
                  disabled={reset.isPending || f.value === 0}
                  onClick={() => { if (window.confirm(`Apagar os eventos de hoje da etapa "${f.label}"? Isso não pode ser desfeito.`)) reset.mutate(f.types); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Onde estão (últimos 5 min)">
          {live.isLoading ? <Skeleton className="h-40" /> : (d?.online.length ?? 0) === 0 ? <EmptyState text="Ninguém online agora." /> : (
            <ul className="divide-y text-sm">
              {d!.online.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" /></span>
                  <span className="font-medium">{(s.leads as { name: string } | null)?.name ?? "Anônimo"}</span>
                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{s.current_page ?? "/"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Páginas mais vistas">
          {live.isLoading ? <Skeleton className="h-40" /> : topPages.length === 0 ? <EmptyState text="Sem visualizações hoje." /> : (
            <ul className="divide-y text-sm">
              {topPages.map(([p, c]) => (
                <li key={p} className="flex items-center justify-between py-2">
                  <span className="truncate font-mono text-xs">{p}</span>
                  <span className="flex items-center gap-1 font-medium tabular"><CheckCircle2 className="h-3 w-3 text-muted-foreground" />{c}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
