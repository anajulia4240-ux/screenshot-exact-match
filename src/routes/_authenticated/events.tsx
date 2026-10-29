import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Flag } from "@/components/admin/common";
import { brl, dayBoundary, extractAdsInfo, fetchAllEvents, fmtDateTime, hasAdsInfo, startOfDayBR } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: "Eventos — Painel Admin" }, { name: "description", content: "Timeline de eventos agrupada por cliente." }] }),
  component: EventsPage,
});

interface Ev { id: string; type: string; lead_id: string | null; session_id: string | null; page: string | null; value_cents: number | null; data: unknown; created_at: string }
interface Lead { id: string; name: string; phone: string | null; email: string | null; city: string | null }
interface Customer { key: string; events: Ev[]; lead?: Lead; ids: Set<string> }

const LABELS: Record<string, string> = {
  click: "Clique", product_view: "Viu produto", add_to_cart: "Carrinho", checkout_opened: "Abriu checkout",
  checkout_filling: "Preenchendo checkout", pix_generated: "PIX gerado", purchase: "Compra",
  whatsapp_click: "Clique no WhatsApp", name_submit: "Enviou nome", coupon_applied: "Cupom aplicado",
  upsell_view: "Viu upsell", upsell_purchase: "Comprou upsell",
};

const field = (e: Ev, k: string): string | null => {
  const v = (e.data as Record<string, unknown> | null)?.[k];
  return typeof v === "string" && v ? v.toLowerCase() : null;
};

/** Union-find: eventos que compartilham lead/e-mail/cpf/telefone/sessão são o mesmo cliente. */
function groupByCustomer(events: Ev[], leads: Map<string, Lead>): Customer[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); parent.set(find(a), find(b)); };
  const idsOf = (e: Ev) => [
    e.lead_id && `lead:${e.lead_id}`, field(e, "email") && `email:${field(e, "email")}`, field(e, "cpf") && `cpf:${field(e, "cpf")}`,
    field(e, "phone") && `phone:${field(e, "phone")}`, e.session_id && `session:${e.session_id}`,
  ].filter((x): x is string => !!x);
  const keyed = events.map((e) => ({ e, ids: idsOf(e) }));
  keyed.forEach(({ ids }) => { ids.forEach((i) => { if (!parent.has(i)) parent.set(i, i); }); ids.slice(1).forEach((i) => union(ids[0], i)); });
  const groups = new Map<string, Customer>();
  keyed.forEach(({ e, ids }) => {
    const root = ids[0] ? find(ids[0]) : `ev:${e.id}`;
    const g = groups.get(root) ?? { key: root, events: [], ids: new Set<string>() };
    g.events.push(e);
    ids.forEach((i) => g.ids.add(i));
    groups.set(root, g);
  });
  const out = [...groups.values()];
  out.forEach((g) => {
    const lid = [...g.ids].find((i) => i.startsWith("lead:"))?.slice(5);
    g.lead = lid ? leads.get(lid) : undefined;
  });
  return out.sort((a, b) => +new Date(b.events[0].created_at) - +new Date(a.events[0].created_at));
}

function status(c: Customer) {
  const last = (t: string) => c.events.find((e) => e.type === t);
  if (last("purchase")) return { label: "Pago", tone: "ok" as const };
  if (last("pix_generated")) return { label: "PIX pendente", tone: "warn" as const };
  const f = last("checkout_filling");
  if (f && Date.now() - +new Date(f.created_at) < 120_000) return { label: "Preenchendo checkout", tone: "danger" as const, pulse: true };
  return { label: "Abandonado", tone: "muted" as const };
}

/** Timeline: só o que foi concluído, mesmo tipo no mesmo minuto vira uma linha. */
function timeline(events: Ev[]): Ev[] {
  const seen = new Set<string>();
  return events.filter((e) => { const k = `${e.type}:${e.created_at.slice(0, 16)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function EventsPage() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [campaign, setCampaign] = useState("");
  const q = useQuery({
    queryKey: ["events", from, to],
    queryFn: async () => {
      const events = await fetchAllEvents(from ? dayBoundary(from) : startOfDayBR(6), to ? dayBoundary(to, true) : undefined);
      const { data, error } = await supabase.from("leads").select("id,name,phone,email,city").limit(1000);
      if (error) throw error;
      return { events, leads: new Map((data ?? []).map((l) => [l.id, l as Lead])) };
    },
  });
  const customers = useMemo(() => (q.data ? groupByCustomer(q.data.events, q.data.leads) : []), [q.data]);
  const info = (c: Customer) => extractAdsInfo(...c.events.map((e) => (e.data as { ads?: unknown } | null)?.ads), c.lead);
  const campaigns = useMemo(() => [...new Set(customers.map((c) => info(c).campaign).filter((x): x is string => !!x))], [customers]);
  const visible = customers.filter((c) => {
    const s = search.trim().toLowerCase();
    const hay = [c.lead?.name, c.lead?.phone, c.lead?.email, ...[...c.ids]].join(" ").toLowerCase();
    return (!s || hay.includes(s)) && (!campaign || info(c).campaign === campaign);
  });

  return (
    <AppShell title="Eventos">
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder="Buscar nome, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campanha">
          <option value="">Todas as campanhas</option>
          {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
      </div>
      {q.isError && <ErrorState />}
      {q.isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        : visible.length === 0 ? <EmptyState text="Nenhum evento no período. Os eventos aparecem aqui quando o site da loja começar a enviá-los." />
        : <div className="space-y-2">{visible.map((c) => <CustomerCard key={c.key} c={c} ads={info(c)} />)}</div>}
    </AppShell>
  );
}

function CustomerCard({ c, ads }: { c: Customer; ads: ReturnType<typeof extractAdsInfo> }) {
  const [open, setOpen] = useState(false);
  const st = status(c);
  const cart = c.events.find((e) => e.value_cents)?.value_cents ?? 0;
  const tl = timeline(c.events);
  return (
    <div className="rounded-lg border bg-card">
      <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{c.lead?.name ?? "Anônimo"}</span>
            <Flag tone={st.tone}>{st.pulse && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />}{st.label}</Flag>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{[c.lead?.phone, c.lead?.city].filter(Boolean).join(" · ") || "Sem dados de contato"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hasAdsInfo(ads) ? [ads.campaign, ads.adset, ads.ad].filter(Boolean).join(" • ") : "Origem desconhecida"}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {cart > 0 && <p className="text-sm font-semibold text-foreground tabular">{brl(cart)}</p>}
          <p>{fmtDateTime(c.events[0].created_at)}</p>
        </div>
        <ChevronDown className={open ? "h-4 w-4 rotate-180 transition" : "h-4 w-4 transition"} />
      </button>
      {open && (
        <div className="border-t p-4">
          <ul className="space-y-1.5">
            {tl.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-l-2 border-primary pl-3 text-sm">
                <span className="font-medium">{LABELS[e.type] ?? e.type}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</span>
                {e.page && <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{e.page}</span>}
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>Origem: {ads.source ?? "—"} · Posicionamento: {ads.placement ?? "—"}</div>
            <div>Primeira página: {c.events[c.events.length - 1].page ?? "—"}</div>
          </dl>
        </div>
      )}
    </div>
  );
}
