import { supabase } from "@/integrations/supabase/client";

export const brl = (cents: number): string =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Início do dia em Brasília (-03:00) como ISO UTC. */
export function startOfDayBR(offsetDays = 0): string {
  const now = new Date(Date.now() - 3 * 3600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offsetDays, 3, 0, 0));
  return d.toISOString();
}

/** Converte "YYYY-MM-DD" em limite do dia com offset -03:00. */
export const dayBoundary = (ymd: string, end = false): string =>
  new Date(`${ymd}T${end ? "23:59:59.999" : "00:00:00"}-03:00`).toISOString();

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export const fmtDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

export interface AdsInfo {
  campaign: string | null;
  adset: string | null;
  ad: string | null;
  source: string | null;
  placement: string | null;
}

const PLACEHOLDER = new Set(["direct", "none", "(none)", "-", "organic", "referral", "paid", "social"]);
const isNumericOnly = (v: string) => /^\d{5,}$/.test(v);

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.includes("{{") || t.toLowerCase().includes("%7b") || PLACEHOLDER.has(t.toLowerCase())) return null;
  return t.includes("|") ? (t.split("|")[0] ?? "").trim() || null : t;
}

/** Fonte única da origem do anúncio: aceita N fontes por ordem de confiança. */
export function extractAdsInfo(...sources: unknown[]): AdsInfo {
  const flat: Record<string, string | null> = {};
  const read = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v && typeof v === "object") read(v);
      else if (!flat[k]) flat[k] = clean(v);
    }
  };
  sources.forEach(read);
  const pick = (...keys: string[]) => {
    const vals = keys.map((k) => flat[k]).filter((x): x is string => !!x);
    return vals.find((x) => !isNumericOnly(x)) ?? vals[0] ?? null;
  };
  return {
    campaign: pick("campaign_name", "utm_campaign", "campaign", "campaign_id"),
    adset: pick("adset_name", "utm_medium", "adset", "adset_id"),
    ad: pick("ad_name", "utm_content", "ad", "ad_id"),
    source: pick("utm_source", "source"),
    placement: pick("utm_term", "placement"),
  };
}

export const hasAdsInfo = (i: AdsInfo): boolean => !!(i.campaign || i.adset || i.ad);

/** Lê tabelas grandes em páginas de 1000 (o PostgREST corta em 1000). */
export async function fetchAllEvents(from: string, to?: string) {
  const rows: {
    id: string; type: string; lead_id: string | null; session_id: string | null;
    page: string | null; value_cents: number | null; data: unknown; created_at: string;
  }[] = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    let q = supabase.from("events").select("*").gte("created_at", from).order("created_at", { ascending: false }).range(offset, offset + 999);
    if (to) q = q.lte("created_at", to);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}
