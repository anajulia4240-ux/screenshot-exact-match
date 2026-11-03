const KEY = "byhappy_sid";
/** Last-touch: troca quando chega clique/campanha nova (chave antiga mantida por compatibilidade). */
const UTM_KEY = "byhappy_utm";
/** First-touch: gravado uma vez, nunca sobrescrito. */
const FIRST_KEY = "byhappy_utm_first";
const FBC_KEY = "byhappy_fbc";

/** Parâmetros aceitos da URL além de utm_* (mesmo conjunto da loja Gummy). */
const TRACK_KEYS = [
  "src", "sck", "fbclid", "gclid", "ttclid",
  "campaign_name", "adset_name", "ad_name",
  "campaign_id", "adset_id", "ad_id",
  "placement", "site_source_name",
];

/** Lixo: vazio, macros não substituídas ({{campaign.name}} / %7B%7B...), "null", "undefined". */
function isJunk(v: unknown): boolean {
  if (typeof v !== "string") return true;
  const t = v.trim();
  if (!t) return true;
  const low = t.toLowerCase();
  if (["null", "undefined", "none", "-", "0"].includes(low)) return true;
  if (/[{}]/.test(t) || /%7b|%7d/i.test(t) || /^\$\{.*\}$/.test(t)) return true;
  return false;
}

/** Limpa os valores e separa "Nome|ID" (formato da Meta) em nome + id. */
function sanitize(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isJunk(v)) continue;
    let s = String(v).trim().slice(0, 200);
    if (/^(utm_campaign|utm_medium|utm_content)$/.test(k) && s.includes("|")) {
      const [namePart = "", idPart = ""] = s.split("|").map((p) => p.trim());
      const base = k === "utm_campaign" ? "campaign" : k === "utm_medium" ? "adset" : "ad";
      if (idPart && /^\d{6,}$/.test(idPart) && !out[`${base}_id`]) out[`${base}_id`] = idPart;
      if (namePart && !isJunk(namePart) && !/^\d{5,}$/.test(namePart)) {
        if (!out[`${base}_name`]) out[`${base}_name`] = namePart;
        s = namePart;
      }
    }
    out[k] = s;
  }
  return out;
}

function readJson(key: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, days = 180): void {
  try {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
  } catch {
    /* ignorado */
  }
}

/** Lê UTMs da URL e atualiza first-touch / last-touch sem nunca apagar valor bom. */
function utms(): Record<string, string> {
  try {
    const p = new URLSearchParams(window.location.search);
    const incoming: Record<string, string> = {};
    p.forEach((v, k) => {
      if (k.startsWith("utm_") || TRACK_KEYS.includes(k)) incoming[k] = v;
    });
    const found = sanitize(incoming);
    if (found["fbclid"]) localStorage.setItem(FBC_KEY, `fb.1.${Date.now()}.${found["fbclid"]}`);

    // Snapshot anterior: localStorage ou, se o navegador limpou, o cookie de backup.
    let prev = readJson(UTM_KEY);
    if (!Object.keys(prev).length) {
      try {
        prev = sanitize(JSON.parse(readCookie(UTM_KEY) || "{}") as Record<string, unknown>);
      } catch {
        prev = {};
      }
    }

    if (Object.keys(found).length) {
      if (!localStorage.getItem(FIRST_KEY)) {
        localStorage.setItem(
          FIRST_KEY,
          JSON.stringify({
            ...found,
            page_url: window.location.href.slice(0, 300),
            referrer: (document.referrer || "").slice(0, 300),
          }),
        );
      }
      // Clique novo de anúncio (fbclid/gclid/ttclid ou campanha nova) reinicia a atribuição;
      // sem isso, só completa campos que estavam vazios.
      const newClick = !!(found["fbclid"] || found["gclid"] || found["ttclid"] || found["utm_source"] || found["utm_campaign"]);
      const next: Record<string, string> = newClick ? found : { ...prev };
      if (!newClick) for (const [k, v] of Object.entries(found)) if (isJunk(next[k])) next[k] = v;
      localStorage.setItem(UTM_KEY, JSON.stringify(next));
      writeCookie(UTM_KEY, JSON.stringify(next));
      return next;
    }
    if (Object.keys(prev).length && !localStorage.getItem(UTM_KEY)) localStorage.setItem(UTM_KEY, JSON.stringify(prev));
    return prev;
  } catch {
    return {};
  }
}

/**
 * Completa UTMs a partir do que temos (nome/id do anúncio, fbclid, referrer).
 * Não inventa campanha: se não houver nada, deixa vazio para o servidor
 * recuperar a campanha pelo lead.
 */
function fillFromKnown(s: Record<string, string>, referrer: string): Record<string, string> {
  const o = { ...s };
  const ref = referrer.toLowerCase();
  if (isJunk(o["utm_source"])) {
    if (o["fbclid"] || o["fbc"] || o["ad_id"] || o["campaign_id"]) o["utm_source"] = "FB";
    else if (o["gclid"]) o["utm_source"] = "google";
    else if (o["ttclid"]) o["utm_source"] = "tiktok";
    else if (/instagram\./.test(ref)) o["utm_source"] = "instagram";
    else if (/facebook\.|fb\./.test(ref)) o["utm_source"] = "FB";
    else delete o["utm_source"];
  }
  if (isJunk(o["utm_campaign"]) && (o["campaign_name"] || o["campaign_id"])) o["utm_campaign"] = o["campaign_name"] || o["campaign_id"] || "";
  if (isJunk(o["utm_medium"]) && (o["adset_name"] || o["adset_id"])) o["utm_medium"] = o["adset_name"] || o["adset_id"] || "";
  if (isJunk(o["utm_content"]) && (o["ad_name"] || o["ad_id"])) o["utm_content"] = o["ad_name"] || o["ad_id"] || "";
  if (isJunk(o["utm_term"]) && (o["placement"] || o["site_source_name"])) o["utm_term"] = o["placement"] || o["site_source_name"] || "";
  if (isJunk(o["src"]) && o["utm_source"]) o["src"] = o["utm_source"];
  for (const k of Object.keys(o)) if (isJunk(o[k])) delete o[k];
  return o;
}

export type Tracking = Record<string, string>;

/** Tudo que o checkout precisa mandar ao servidor: last-touch com fallback no first-touch + fbp/fbc. */
export function getTracking(): Tracking {
  if (typeof window === "undefined") return {};
  const last = utms();
  const first = readJson(FIRST_KEY);
  const { page_url: firstPage = "", referrer: firstRef = "", ...firstUtms } = first;
  const out: Tracking = fillFromKnown({ ...firstUtms, ...last }, firstRef || document.referrer || "");
  const fbc = localStorage.getItem(FBC_KEY) || readCookie("_fbc");
  const fbp = readCookie("_fbp");
  if (fbc) out["fbc"] = fbc;
  if (fbp) out["fbp"] = fbp;
  for (const [k, v] of Object.entries(firstUtms)) out[`first_${k}`] = v;
  if (firstPage) out["first_page_url"] = firstPage;
  if (firstRef) out["first_referrer"] = firstRef;
  out["event_source_url"] = window.location.href;
  // O servidor aceita no máximo 300 caracteres por valor.
  for (const k of Object.keys(out)) out[k] = String(out[k]).slice(0, 300);
  return out;
}

export const getSessionId = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Envia um evento da loja para o painel. Falhas são ignoradas para não atrapalhar a cliente. */
export async function track(type: string, data?: Record<string, string | number>): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/public/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: localStorage.getItem(KEY),
        type,
        page: window.location.pathname,
        referrer: document.referrer,
        utm: utms(),
        data,
      }),
      keepalive: true,
    });
    const j = (await res.json()) as { session_id?: string };
    if (j.session_id) localStorage.setItem(KEY, j.session_id);
  } catch {
    /* ignorado */
  }
}
