import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clock3, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/admin/common";
import { brl, fetchAllEvents, startOfDayBR } from "@/lib/store";

/**
 * Aba Eventos — mesmo modelo do painel da Gummy (archive-forever-box/EventsBoard),
 * adaptado aos dados da byhappy: um card por lead/sessão, vendas por campanha,
 * filtros por etapa, temperatura, origem (Meta Ads) e linha do tempo.
 */
export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({
    meta: [
      { title: "Eventos — Painel Admin" },
      { name: "description", content: "Acompanhe cada lead e a jornada completa." },
    ],
  }),
  component: EventsPage,
});

// ---------- Tipos ----------

type Data = Record<string, unknown>;

interface Ev {
  id: string;
  type: string;
  lead_id: string | null;
  session_id: string | null;
  page: string | null;
  value_cents: number | null;
  data: Data | null;
  created_at: string;
}

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface Sess {
  id: string;
  lead_id: string | null;
  last_seen_at: string;
}

interface Order {
  id: string;
  lead_id: string | null;
  status: string;
  total_cents: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  coupon_code: string | null;
  created_at: string;
  paid_at: string | null;
  tracking: Data | null;
}

interface Attribution {
  origin: string;
  platform: string | null;
  utm_source?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  placement?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  src?: string;
  sck?: string;
}

interface Group {
  key: string;
  leadId: string | null;
  lead: Lead | null;
  name: string;
  events: Ev[];
  online: boolean;
}

// ---------- Regras da jornada ----------

/** Eventos internos do servidor (envio pra Utmify/Meta) não entram na jornada do lead. */
const SYSTEM_TYPES = /^(utmify_|meta_|email_)/;
const ABANDON_AFTER_MS = 15 * 60 * 1000;
const ONLINE_WINDOW_MS = 60 * 1000;
const PAGE_SIZE = 24;

const EVENT_SCORE: Record<string, number> = {
  page_view: 10,
  identification_shown: 10,
  identification_skipped: 10,
  section_view: 15,
  video_play: 20,
  whatsapp_click: 25,
  coupon_applied: 65,
  click: 15,
  product_view: 20,
  add_to_cart: 40,
  checkout_opened: 50,
  checkout_filling: 55,
  checkout_step: 60,
  lead_identified: 60,
  pix_failed: 70,
  pix_generated: 85,
  pix_copied: 92,
  pix_paid: 100,
};

type Status = "NAVEGANDO" | "CARRINHO" | "CHECKOUT" | "PIX" | "PAGOU" | "ABANDONOU";

const STATUS_STYLE: Record<Status, string> = {
  PAGOU: "bg-emerald-100 text-emerald-700",
  PIX: "bg-amber-100 text-amber-700",
  CHECKOUT: "bg-orange-100 text-orange-700",
  CARRINHO: "bg-blue-100 text-blue-700",
  NAVEGANDO: "bg-slate-100 text-slate-600",
  ABANDONOU: "bg-red-100 text-red-700",
};

const TEMP_STYLE: Record<string, string> = {
  QUENTE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MORNO: "bg-sky-50 text-sky-700 border-sky-200",
  FRIO: "bg-slate-50 text-slate-500 border-slate-200",
};

const ORIGIN_STYLE = (origin: string) =>
  origin.includes("Facebook")
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : origin.includes("Instagram")
      ? "bg-pink-50 text-pink-700 border-pink-200"
      : origin.includes("TikTok")
        ? "bg-slate-900 text-white border-slate-900"
        : origin.includes("Google")
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : origin.includes("WhatsApp")
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-slate-50 text-slate-600 border-slate-200";

const TIMELINE_ACCENT: Record<string, string> = {
  lead_identified: "border-l-violet-500 bg-violet-50/60",
  add_to_cart: "border-l-pink-500 bg-pink-50/60",
  checkout_opened: "border-l-amber-500 bg-amber-50/60",
  checkout_filling: "border-l-amber-400 bg-amber-50/40",
  checkout_step: "border-l-amber-400 bg-amber-50/40",
  pix_failed: "border-l-red-500 bg-red-50/60",
  pix_generated: "border-l-orange-500 bg-orange-100/70",
  pix_copied: "border-l-blue-500 bg-blue-50/70",
  pix_paid: "border-l-emerald-500 bg-emerald-50/70",
};

type FilterId = "all" | "recent" | "visited" | "cart" | "checkout" | "pix" | "paid" | "abandoned";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "recent", label: "Últimos 15min" },
  { id: "visited", label: "Visitou" },
  { id: "cart", label: "Adicionou ao carrinho" },
  { id: "checkout", label: "Abriu checkout" },
  { id: "pix", label: "Gerou PIX" },
  { id: "paid", label: "Pagou" },
  { id: "abandoned", label: "Abandonou" },
];

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const hasType = (evs: Ev[], t: string) => evs.some((e) => e.type === t);
const lastEventAt = (evs: Ev[]) => evs.reduce((m, e) => Math.max(m, new Date(e.created_at).getTime()), 0);

function temperature(evs: Ev[]) {
  let score = 0;
  for (const e of evs) score = Math.max(score, EVENT_SCORE[e.type] ?? 5);
  const label = score >= 85 ? "QUENTE" : score >= 50 ? "MORNO" : "FRIO";
  return { label, score };
}

function leadStatus(evs: Ev[], online: boolean, now: number, paid: boolean): Status {
  if (paid || hasType(evs, "pix_paid")) return "PAGOU";
  const idle = now - lastEventAt(evs);
  const reachedCart = hasType(evs, "add_to_cart") || hasType(evs, "checkout_opened") || hasType(evs, "pix_generated");
  if (!online && idle > ABANDON_AFTER_MS && reachedCart) return "ABANDONOU";
  if (hasType(evs, "pix_generated")) return "PIX";
  if (hasType(evs, "checkout_opened") || hasType(evs, "checkout_step") || hasType(evs, "checkout_filling")) return "CHECKOUT";
  if (hasType(evs, "add_to_cart")) return "CARRINHO";
  return "NAVEGANDO";
}

function recoveryStage(evs: Ev[], paid: boolean): "cart" | "checkout" | "pix" | "none" {
  if (paid || hasType(evs, "pix_paid")) return "none";
  if (hasType(evs, "pix_generated")) return "pix";
  if (hasType(evs, "checkout_opened") || hasType(evs, "checkout_step")) return "checkout";
  if (hasType(evs, "add_to_cart")) return "cart";
  return "none";
}

const STAGE_TEMPLATES = {
  cart: "Olá {nome}! 💚 Vi que você adicionou {produto} ao carrinho e não finalizou. Posso te ajudar a fechar seu pedido hoje?",
  checkout: "Olá {nome}! 💚 Vi que você começou a finalizar a compra de {produto}{valor} e não concluiu. Posso te ajudar a finalizar agora?",
  pix: "Olá {nome}! 💚 Seu PIX{valor} para {produto} foi gerado e ainda está aguardando pagamento. Quer que eu te ajude a concluir?",
} as const;

function shortTimeSince(ms: number): string {
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return `${s}S`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}MIN`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H`;
  return `${Math.floor(h / 24)}D`;
}

function whatsappNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("55") && d.length > 11 ? d : `55${d}`;
}

/** "Nome|ID" quando houver os dois (igual ao painel da Gummy). */
function pair(name: unknown, id: unknown, fallback: unknown): string | undefined {
  const n = str(name) ?? str(fallback);
  const i = str(id);
  if (n && n.includes("|")) return n;
  if (n && i && n !== i) return `${n}|${i}`;
  return n ?? i;
}

function originOf(source: string | undefined, d: Data): string {
  const s = (source ?? "").toLowerCase();
  if (/^ig$|instagram/.test(s)) return "Instagram Ads";
  if (/^fb$|facebook|meta/.test(s) || str(d["fbclid"])) return "Facebook Ads";
  if (/tiktok/.test(s) || str(d["ttclid"])) return "TikTok Ads";
  if (/google/.test(s) || str(d["gclid"])) return "Google Ads";
  if (/whats/.test(s)) return "WhatsApp";
  return source ? source : "Direto";
}

/** Lê a origem gravada no evento (as UTMs ficam no próprio data do evento). */
function attributionFromData(raw: Data | null): Attribution | null {
  if (!raw) return null;
  const nested = raw["ads"] && typeof raw["ads"] === "object" ? (raw["ads"] as Data) : {};
  const d: Data = { ...nested, ...raw };
  const source = str(d["utm_source"]) ?? str(d["src"]);
  const campaign = pair(d["campaign_name"], d["campaign_id"], d["utm_campaign"]);
  const adset = pair(d["adset_name"], d["adset_id"], d["utm_medium"]);
  const ad = pair(d["ad_name"], d["ad_id"], d["utm_content"]);
  const placement = str(d["placement"]) ?? str(d["utm_term"]) ?? str(d["site_source_name"]);
  if (!source && !campaign && !adset && !ad && !str(d["fbclid"]) && !str(d["gclid"]) && !str(d["ttclid"])) return null;
  const origin = originOf(source, d);
  const attr: Attribution = {
    origin,
    platform: /Facebook|Instagram/.test(origin) ? "Meta Ads" : /TikTok/.test(origin) ? "TikTok Ads" : /Google/.test(origin) ? "Google Ads" : null,
  };
  if (source) attr.utm_source = source;
  if (campaign) attr.campaign = campaign;
  if (adset) attr.adset = adset;
  if (ad) attr.ad = ad;
  if (placement) attr.placement = placement;
  const fb = str(d["fbclid"]);
  const gc = str(d["gclid"]);
  const tt = str(d["ttclid"]);
  const sr = str(d["src"]);
  const sc = str(d["sck"]);
  if (fb) attr.fbclid = fb;
  if (gc) attr.gclid = gc;
  if (tt) attr.ttclid = tt;
  if (sr) attr.src = sr;
  if (sc) attr.sck = sc;
  return attr;
}

function attributionOf(evs: Ev[]): { first: Attribution | null; last: Attribution | null } {
  const asc = [...evs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  let first: Attribution | null = null;
  let last: Attribution | null = null;
  for (const e of asc) {
    const cur = attributionFromData(e.data);
    if (cur && !first) first = cur;
    if (cur) last = cur;
  }
  return { first, last };
}

/** Pedido da jornada: pelo order_id dos eventos, depois pelo lead, depois telefone/e-mail. */
function orderForJourney(evs: Ev[], lead: Lead | null, orders: Order[], byId: Map<string, Order>): Order | null {
  const recent = [...evs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  for (const e of recent) {
    const id = str(e.data?.["order_id"]);
    const o = id ? byId.get(id) : undefined;
    if (o) return o;
  }
  const leadId = lead?.id ?? evs.find((e) => e.lead_id)?.lead_id ?? null;
  const pick = (list: Order[]) => [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null;
  if (leadId) {
    const o = pick(orders.filter((x) => x.lead_id === leadId));
    if (o) return o;
  }
  const phone = (lead?.phone ?? "").replace(/\D/g, "").slice(-11);
  const email = (lead?.email ?? "").trim().toLowerCase();
  if (!phone && !email) return null;
  return pick(
    orders.filter(
      (x) =>
        (phone && (x.customer_phone ?? "").replace(/\D/g, "").slice(-11) === phone) ||
        (email && (x.customer_email ?? "").trim().toLowerCase() === email),
    ),
  );
}

/** Campanha da jornada: a do pedido (se houver) — nunca mistura visitas diferentes. */
function campaignForJourney(evs: Ev[], order: Order | null, lead: Lead | null): Attribution | null {
  if (order?.tracking) {
    const fromOrder = attributionFromData(order.tracking);
    if (fromOrder) return fromOrder;
  }
  const visit = attributionOf(evs);
  if (visit.last ?? visit.first) return visit.last ?? visit.first;
  if (lead && (lead.utm_source || lead.utm_campaign)) {
    return attributionFromData({
      utm_source: lead.utm_source,
      utm_campaign: lead.utm_campaign,
      utm_medium: lead.utm_medium,
    });
  }
  return null;
}

function buildGroups(leads: Lead[], events: Ev[], sessions: Sess[], orders: Order[], now: number): Group[] {
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sessionLead = new Map(sessions.map((s) => [s.id, s.lead_id]));
  const orderLead = new Map(orders.map((o) => [o.id, o.lead_id]));
  const onlineSessions = new Set(
    sessions.filter((s) => now - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS).map((s) => s.id),
  );
  const onlineLeads = new Set(
    sessions
      .filter((s) => s.lead_id && onlineSessions.has(s.id))
      .map((s) => s.lead_id as string),
  );
  const map = new Map<string, Group>();
  for (const e of events) {
    if (SYSTEM_TYPES.test(e.type)) continue;
    const orderId = str(e.data?.["order_id"]);
    const leadId =
      e.lead_id ||
      (e.session_id ? sessionLead.get(e.session_id) ?? null : null) ||
      (orderId ? orderLead.get(orderId) ?? null : null);
    const key = leadId
      ? `lead:${leadId}`
      : e.session_id
        ? `sess:${e.session_id}`
        : orderId
          ? `order:${orderId}`
          : `evt:${e.id}`;
    const online = leadId ? onlineLeads.has(leadId) : !!(e.session_id && onlineSessions.has(e.session_id));
    const cur = map.get(key);
    if (cur) {
      cur.events.push(e);
      cur.online = cur.online || online;
      continue;
    }
    const lead = leadId ? leadById.get(leadId) ?? null : null;
    map.set(key, { key, leadId, lead, name: lead?.name?.trim() || "Visitante", events: [e], online });
  }
  // Leads sem evento ainda também aparecem.
  for (const l of leads) {
    const key = `lead:${l.id}`;
    if (!map.has(key)) map.set(key, { key, leadId: l.id, lead: l, name: l.name || "Visitante", events: [], online: onlineLeads.has(l.id) });
  }
  // Você mesma testando (lead "adm"/"teste") vira um card só.
  const out = new Map<string, Group>();
  let adm: Group | null = null;
  for (const g of map.values()) {
    if (!/^(adm|admin|teste|test)\b/i.test(g.name.trim())) {
      out.set(g.key, g);
      continue;
    }
    if (!adm) {
      adm = { ...g, key: "adm:self", name: "ADM (Você) · testes", events: [...g.events] };
      out.set(adm.key, adm);
    } else {
      adm.events.push(...g.events);
      adm.online = adm.online || g.online;
    }
  }
  return [...out.values()].sort((a, b) => lastEventAt(b.events) - lastEventAt(a.events) || +new Date(b.lead?.created_at ?? 0) - +new Date(a.lead?.created_at ?? 0));
}

function timelineLabel(e: Ev & { _count?: number }): { icon: string; label: string; detail?: string } {
  const d = e.data ?? {};
  switch (e.type) {
    case "page_view":
      return { icon: "👀", label: e._count && e._count > 1 ? `Visitou ${e._count}x` : "Visitou", detail: e.page ?? undefined };
    case "click":
      return { icon: "👆", label: "Clicou", detail: str(d["label"]) ?? str(d["target"]) };
    case "product_view":
      return { icon: "🔍", label: "Viu produto", detail: str(d["name"]) ?? str(d["title"]) ?? str(d["slug"]) };
    case "add_to_cart":
      return { icon: "🛒", label: "Adicionou ao carrinho", detail: str(d["name"]) ?? str(d["title"]) ?? str(d["slug"]) };
    case "checkout_opened":
      return { icon: "🛍️", label: "Abriu checkout" };
    case "checkout_filling":
      return { icon: "🖊", label: "Preenchendo checkout" };
    case "checkout_step":
      return { icon: "➡️", label: `Avançou para a etapa ${typeof d["step"] === "number" ? d["step"] : str(d["step"]) ?? ""}`.trim() };
    case "lead_identified":
      return { icon: "🙋", label: "Identificou-se", detail: str(d["name"]) };
    case "pix_generated":
      return { icon: "💰", label: "Gerou PIX" };
    case "pix_failed":
      return { icon: "⚠️", label: "Falha ao gerar PIX", detail: str(d["error"]) };
    case "pix_copied":
      return { icon: "📋", label: "Copiou PIX" };
    case "pix_paid":
      return { icon: "✅", label: "PIX Pago" };
    case "identification_shown":
      return { icon: "🪪", label: "Viu o pop-up de desconto" };
    case "identification_skipped":
      return { icon: "🙈", label: "Fechou o pop-up sem se identificar" };
    case "section_view":
      return { icon: "📍", label: "Chegou na seção", detail: str(d["label"]) ?? str(d["section"]) };
    case "video_play":
      return { icon: "▶️", label: "Assistiu vídeo", detail: str(d["label"]) };
    case "whatsapp_click":
      return { icon: "💬", label: "Clicou no WhatsApp", detail: str(d["label"]) };
    case "coupon_applied":
      return { icon: "🎟️", label: "Aplicou cupom", detail: str(d["code"]) };
    default:
      return { icon: "•", label: e.type };
  }
}

/** Visitas seguidas viram uma linha só ("Visitou 5x"). */
function compactTimeline(evs: Ev[]): (Ev & { _count?: number })[] {
  const asc = [...evs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const out: (Ev & { _count?: number })[] = [];
  let pages: Ev[] = [];
  const flush = () => {
    const lastPage = pages[pages.length - 1];
    if (lastPage) out.push(pages.length > 1 ? { ...lastPage, _count: pages.length } : lastPage);
    pages = [];
  };
  for (const e of asc) {
    if (e.type === "page_view") pages.push(e);
    else {
      flush();
      out.push(e);
    }
  }
  flush();
  return out;
}

// ---------- Página ----------

function EventsPage() {
  const [days, setDays] = useState(7);
  const q = useQuery({
    queryKey: ["events-board", days],
    refetchInterval: 15000,
    queryFn: async () => {
      const from = days === 1 ? startOfDayBR(0) : startOfDayBR(days - 1);
      const [events, leadsRes, sessRes, ordersRes] = await Promise.all([
        fetchAllEvents(from),
        supabase
          .from("leads")
          .select("id,name,phone,email,city,created_at,utm_source,utm_medium,utm_campaign")
          .gte("created_at", from)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("sessions")
          .select("id,lead_id,last_seen_at")
          .gte("last_seen_at", from)
          .order("last_seen_at", { ascending: false })
          .limit(1000),
        supabase
          .from("orders")
          .select("id,lead_id,status,total_cents,customer_name,customer_phone,customer_email,coupon_code,created_at,paid_at,tracking")
          .gte("created_at", from)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      return {
        events: events as unknown as Ev[],
        leads: (leadsRes.data ?? []) as unknown as Lead[],
        sessions: (sessRes.data ?? []) as unknown as Sess[],
        orders: (ordersRes.data ?? []) as unknown as Order[],
        at: Date.now(),
      };
    },
  });

  return (
    <AppShell title="Eventos">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Acompanhe cada lead e abra a jornada completa quando precisar.</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Período"
          >
            <option value={1}>Hoje</option>
            <option value={2}>Últimos 2 dias</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
          {q.data && <span>Atualizado às {new Date(q.data.at).toLocaleTimeString("pt-BR")}</span>}
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="inline-flex size-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
            aria-label="Atualizar"
          >
            <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {q.isError && <ErrorState />}
      {q.isLoading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Carregando eventos…</div>
      ) : q.data ? (
        <EventsBoard events={q.data.events} leads={q.data.leads} sessions={q.data.sessions} orders={q.data.orders} />
      ) : null}
    </AppShell>
  );
}

interface CampaignStat {
  campaign: string;
  origin: string;
  leads: number;
  pix: number;
  paid: number;
  revenue: number;
}

function EventsBoard({ events, leads, sessions, orders }: { events: Ev[]; leads: Lead[]; sessions: Sess[]; orders: Order[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setLimit(PAGE_SIZE), [filter, campaignFilter, query]);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const groups = useMemo(() => buildGroups(leads, events, sessions, orders, now), [leads, events, sessions, orders, now]);
  const orderOf = useMemo(() => {
    const m = new Map<string, Order | null>();
    for (const g of groups) m.set(g.key, orderForJourney(g.events, g.lead, orders, orderById));
    return m;
  }, [groups, orders, orderById]);
  const campaignOf = useMemo(() => {
    const m = new Map<string, Attribution | null>();
    for (const g of groups) m.set(g.key, campaignForJourney(g.events, orderOf.get(g.key) ?? null, g.lead));
    return m;
  }, [groups, orderOf]);

  const stats = useMemo(() => {
    const map = new Map<string, CampaignStat>();
    for (const g of groups) {
      const order = orderOf.get(g.key) ?? null;
      const attr = campaignOf.get(g.key) ?? null;
      const campaign = attr?.campaign || "Sem campanha";
      const cur = map.get(campaign) ?? { campaign, origin: attr?.origin ?? "Direto", leads: 0, pix: 0, paid: 0, revenue: 0 };
      cur.leads += 1;
      if (hasType(g.events, "pix_generated") || order) cur.pix += 1;
      if (hasType(g.events, "pix_paid") || order?.status === "paid") {
        cur.paid += 1;
        cur.revenue += order?.total_cents ?? 0;
      }
      map.set(campaign, cur);
    }
    return [...map.values()].sort((a, b) => b.paid - a.paid || b.revenue - a.revenue || b.leads - a.leads);
  }, [groups, orderOf, campaignOf]);

  const onlineCount = groups.filter((g) => g.online).length;

  const visible = useMemo(() => {
    const s = query.trim().toLowerCase();
    return groups.filter((g) => {
      const evs = g.events;
      const order = orderOf.get(g.key) ?? null;
      const paid = hasType(evs, "pix_paid") || order?.status === "paid";
      const attr = campaignOf.get(g.key) ?? null;
      if (campaignFilter && (attr?.campaign || "Sem campanha") !== campaignFilter) return false;
      switch (filter) {
        case "recent":
          if (now - lastEventAt(evs) > ABANDON_AFTER_MS) return false;
          break;
        case "visited":
          if (!hasType(evs, "page_view") && !hasType(evs, "product_view")) return false;
          break;
        case "cart":
          if (!hasType(evs, "add_to_cart")) return false;
          break;
        case "checkout":
          if (!hasType(evs, "checkout_opened")) return false;
          break;
        case "pix":
          if (!hasType(evs, "pix_generated") && !order) return false;
          break;
        case "paid":
          if (!paid) return false;
          break;
        case "abandoned":
          if (leadStatus(evs, g.online, now, paid) !== "ABANDONOU") return false;
          break;
        default:
          break;
      }
      if (!s) return true;
      const hay = [
        g.name,
        g.lead?.phone,
        g.lead?.email,
        order?.customer_name,
        order?.customer_phone,
        order?.customer_email,
        str((order?.tracking?.["customer"] as Data | undefined)?.["cpf"]),
        attr?.origin,
        attr?.campaign,
        attr?.adset,
        attr?.ad,
        attr?.placement,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [groups, filter, campaignFilter, query, now, orderOf, campaignOf]);

  return (
    <div className="space-y-4">
      {stats.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">🎯 Vendas por campanha</span>
            {campaignFilter && (
              <button
                type="button"
                onClick={() => setCampaignFilter(null)}
                className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-muted/70"
              >
                ✕ Limpar filtro
              </button>
            )}
          </div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max gap-2">
              {stats.map((s) => {
                const active = campaignFilter === s.campaign;
                return (
                  <button
                    key={s.campaign}
                    type="button"
                    onClick={() => setCampaignFilter(active ? null : s.campaign)}
                    className={`min-w-[150px] rounded-lg border px-3 py-2 text-left transition ${
                      active ? "border-pink-400 bg-pink-50 shadow-sm" : "bg-background hover:border-pink-200 hover:bg-pink-50/40"
                    }`}
                  >
                    <div className="max-w-[180px] truncate text-[11px] font-extrabold" title={s.campaign}>
                      {s.campaign}
                    </div>
                    <div className="max-w-[180px] truncate text-[9px] font-semibold text-muted-foreground">{s.origin}</div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                      <div>
                        <div className="text-[13px] font-black text-slate-700">{s.leads}</div>
                        <div className="text-[8px] font-bold uppercase text-slate-400">leads</div>
                      </div>
                      <div>
                        <div className="text-[13px] font-black text-amber-600">{s.pix}</div>
                        <div className="text-[8px] font-bold uppercase text-slate-400">pix</div>
                      </div>
                      <div>
                        <div className="text-[13px] font-black text-emerald-600">{s.paid}</div>
                        <div className="text-[8px] font-bold uppercase text-slate-400">vendas</div>
                      </div>
                    </div>
                    {s.revenue > 0 && <div className="mt-1 text-[11px] font-black text-emerald-700">{brl(s.revenue)}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-8 rounded-full border px-3.5 text-sm font-medium transition ${
                filter === f.id ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Buscar lead</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nome, telefone, CPF ou campanha"
            className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold">{visible.length} leads</div>
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            {onlineCount} online
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">Nenhum lead neste filtro.</div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
          {visible.slice(0, limit).map((g, i) => (
            <LeadCard
              key={g.key}
              group={g}
              now={now}
              position={i + 1}
              order={orderOf.get(g.key) ?? null}
              campaign={campaignOf.get(g.key) ?? null}
            />
          ))}
        </div>
      )}
      {limit < visible.length && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setLimit((v) => v + PAGE_SIZE)}
            className="rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Mostrar mais {Math.min(PAGE_SIZE, visible.length - limit)} leads
          </button>
        </div>
      )}
    </div>
  );
}

function AdsBlock({ attr }: { attr: Attribution }) {
  const rows: [string, string | undefined][] = [
    ["Campanha", attr.campaign],
    ["Conjunto", attr.adset],
    ["Anúncio", attr.ad],
    ["Posicionamento", attr.placement],
  ];
  const shown = rows.filter(([, v]) => !!v);
  if (!shown.length) return null;
  return (
    <div className="rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2">
      <div className="text-[11px] font-bold text-pink-600">🎯 {attr.platform ?? "Origem"}</div>
      <div className="mt-1 space-y-0.5 text-[11px] leading-snug">
        {shown.map(([k, v]) => (
          <div key={k} className="truncate">
            <span className="text-slate-500">{k}: </span>
            <span className="font-semibold text-slate-800">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UtmDetails({ attr, title }: { attr: Attribution; title: string }) {
  const rows: [string, string | undefined][] = [
    ["Origem", attr.origin],
    ["Fonte", attr.utm_source],
    ["fbclid", attr.fbclid],
    ["gclid", attr.gclid],
    ["ttclid", attr.ttclid],
    ["sck", attr.sck],
  ];
  const shown = rows.filter(([, v]) => !!v);
  if (!shown.length) return null;
  return (
    <div>
      <div className="mb-1 font-bold text-slate-700">{title}</div>
      <div className="space-y-0.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]">
        {shown.map(([k, v]) => (
          <div key={k} className="break-all">
            <span className="text-slate-500">{k}: </span>
            <span className="font-semibold text-slate-800">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadCard({
  group,
  now,
  position,
  order,
  campaign,
}: {
  group: Group;
  now: number;
  position: number;
  order: Order | null;
  campaign: Attribution | null;
}) {
  const [open, setOpen] = useState(false);
  const evs = group.events;
  const paid = hasType(evs, "pix_paid") || order?.status === "paid";
  const status = leadStatus(evs, group.online, now, paid);
  const temp = temperature(paid ? [...evs, { type: "pix_paid" } as Ev] : evs);
  const attr = attributionOf(evs);
  const last = lastEventAt(evs) || +new Date(group.lead?.created_at ?? 0);
  const phone = order?.customer_phone ?? group.lead?.phone ?? null;
  const name = order?.customer_name ?? (group.lead?.name || null);
  const pixGenerated = hasType(evs, "pix_generated") || !!order;
  const stage = recoveryStage(evs, paid);
  const lastCheckout = evs
    .filter((e) => e.type.startsWith("checkout_"))
    .reduce((m, e) => Math.max(m, new Date(e.created_at).getTime()), 0);
  const filling = group.online && !paid && lastCheckout > 0 && now - lastCheckout < 5 * 60 * 1000;
  const valueEvent = [...evs].reverse().find((e) => e.value_cents);
  const valueCents = order?.total_cents ?? valueEvent?.value_cents ?? 0;
  const lastCart = [...evs].reverse().find((e) => e.type === "add_to_cart");
  const product = str(lastCart?.data?.["name"]) ?? str(lastCart?.data?.["title"]) ?? "seu pedido";
  const timeline = compactTimeline(evs);
  const statusLabel = paid ? "PAGOU" : status === "PIX" ? "GEROU PIX" : status;
  const dot = paid
    ? "bg-emerald-500"
    : status === "PIX"
      ? "bg-amber-500"
      : status === "ABANDONOU"
        ? "bg-orange-500"
        : group.online
          ? "bg-emerald-500"
          : "bg-muted-foreground/40";
  const frame = paid
    ? "border-emerald-300"
    : filling
      ? "border-orange-300"
      : status === "PIX"
        ? "border-amber-300"
        : status === "ABANDONOU"
          ? "border-red-200"
          : "border-slate-200";
  const firstName = (name ?? group.name).trim().split(/\s+/)[0] || "tudo bem";
  const message =
    stage === "none"
      ? ""
      : STAGE_TEMPLATES[stage]
          .replace("{nome}", firstName)
          .replace("{produto}", product)
          .replace("{valor}", valueCents ? ` de ${brl(valueCents)}` : "");

  return (
    <article className={`overflow-hidden rounded-2xl border-2 bg-card shadow-sm transition hover:shadow-md ${frame}`}>
      <div className="space-y-2 p-3.5 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              title={group.online ? "Online" : "Offline"}
              className={`size-2.5 shrink-0 rounded-full ${dot} ${group.online ? "motion-safe:animate-pulse" : ""}`}
            />
            <span className="truncate text-[15px] font-extrabold">{group.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[paid ? "PAGOU" : status]}`}>
              {statusLabel} · {last ? shortTimeSince(now - last) : "—"}
            </span>
            {filling && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">🖊 PREENCHENDO CHECKOUT</span>
            )}
          </div>
          <span className="text-xs font-bold text-muted-foreground">#{position}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {order?.coupon_code && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {order.coupon_code}
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${TEMP_STYLE[temp.label]}`}>
            {temp.label} · {temp.score}
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span
            className={`w-fit max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold ${ORIGIN_STYLE(campaign?.origin ?? "Direto")}`}
          >
            {campaign?.origin ?? "Direto"}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Clock3 className="size-3" />
            {last ? new Date(last).toLocaleString("pt-BR") : "—"}
          </span>
        </div>

        {phone && <div className="text-[13px] font-bold tracking-wide text-slate-700">📞 {phone}</div>}

        {campaign && <AdsBlock attr={campaign} />}

        {(name || phone) && !paid && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <span className="text-[11px] font-bold text-slate-600">📋 Dados preenchidos no checkout</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase text-white ${pixGenerated ? "bg-amber-500" : "bg-red-500"}`}
              >
                {pixGenerated ? "PIX gerado" : "PIX não gerado"}
              </span>
            </div>
            <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
              {name && (
                <div className="truncate">
                  <span className="text-slate-500">Nome: </span>
                  <span className="font-semibold">{name}</span>
                </div>
              )}
              {phone && (
                <div className="truncate">
                  <span className="text-slate-500">Tel: </span>
                  <span className="font-semibold">{phone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {valueCents > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-[10px] text-muted-foreground">{order ? `Pedido ${order.id.slice(0, 8)}` : ""}</span>
            <strong>{brl(valueCents)}</strong>
          </div>
        )}

        {timeline.length > 0 && (
          <div className="border-t pt-2.5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex w-full items-center gap-1.5 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-slate-700"
            >
              {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
              🧾 Linha do tempo — {timeline.length} eventos
            </button>
            {open && (
              <div className="mt-1.5 space-y-1.5">
                {[...timeline].reverse().map((e) => {
                  const l = timelineLabel(e);
                  return (
                    <div
                      key={e.id}
                      className={`rounded-lg border-l-[3px] bg-muted/40 px-2.5 py-1.5 ${TIMELINE_ACCENT[e.type] ?? "border-l-slate-300"}`}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                        <span className="truncate text-[12px] font-bold text-slate-800">
                          {l.icon} {l.label}
                        </span>
                        <time className="shrink-0 text-[10px] text-slate-500">
                          {new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <span className="truncate font-mono text-[10px] text-slate-400">{l.detail ?? e.page ?? ""}</span>
                        {e.value_cents ? <span className="shrink-0 text-[10px] font-bold text-emerald-600">{brl(e.value_cents)}</span> : null}
                      </div>
                    </div>
                  );
                })}
                {attr.first && (
                  <div className="space-y-2">
                    <UtmDetails attr={attr.first} title="Primeira visita" />
                    <AdsBlock attr={attr.first} />
                  </div>
                )}
                {attr.last &&
                  (attr.last.origin !== attr.first?.origin ||
                    attr.last.campaign !== attr.first?.campaign ||
                    attr.last.adset !== attr.first?.adset ||
                    attr.last.ad !== attr.first?.ad) && (
                    <div className="space-y-2">
                      <UtmDetails attr={attr.last} title="Última origem (retorno)" />
                      <AdsBlock attr={attr.last} />
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-3.5 py-2.5 sm:px-4">
        {phone ? (
          <a
            href={`https://wa.me/${whatsappNumber(phone)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-emerald-700 hover:underline"
          >
            📞 {phone}
          </a>
        ) : (
          <span className="text-xs text-slate-400">sem telefone</span>
        )}
        {!paid && stage !== "none" && phone && (
          <a
            href={`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            title="Abre o WhatsApp com a mensagem da etapa"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
          >
            💬 WhatsApp
          </a>
        )}
        {paid && <span className="text-[11px] font-bold text-emerald-700">✅ Pago — sem recuperação</span>}
      </div>
    </article>
  );
}
