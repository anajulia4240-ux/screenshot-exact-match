const KEY = "byhappy_sid";
/** Last-touch: atualiza só quando chega UTM nova (chave antiga mantida por compatibilidade). */
const UTM_KEY = "byhappy_utm";
/** First-touch: gravado uma vez, nunca sobrescrito. */
const FIRST_KEY = "byhappy_utm_first";
const FBC_KEY = "byhappy_fbc";

const TRACK_KEYS = ["src", "sck", "fbclid", "campaign_name", "adset_name", "ad_name"];

/** Descarta vazios e macros não substituídas ({{campaign.name}} / %7B%7B...). */
function isUsable(v: string): boolean {
  const t = v.trim();
  return !!t && !t.includes("{{") && !t.toLowerCase().includes("%7b");
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

/** Lê UTMs da URL e atualiza first-touch / last-touch sem nunca apagar valor existente. */
function utms(): Record<string, string> {
  try {
    const p = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    p.forEach((v, k) => {
      if ((k.startsWith("utm_") || TRACK_KEYS.includes(k)) && isUsable(v))
        found[k] = v.trim().slice(0, 200);
    });
    if (found["fbclid"]) localStorage.setItem(FBC_KEY, `fb.1.${Date.now()}.${found["fbclid"]}`);
    if (Object.keys(found).length) {
      if (!localStorage.getItem(FIRST_KEY)) localStorage.setItem(FIRST_KEY, JSON.stringify(found));
      // Só troca o last-touch se a visita trouxe campanha nova; mescla para não perder campos.
      const prev = readJson(UTM_KEY);
      const next = found["utm_source"] || found["utm_campaign"] ? found : { ...prev, ...found };
      localStorage.setItem(UTM_KEY, JSON.stringify(next));
    }
    return readJson(UTM_KEY);
  } catch {
    return {};
  }
}

export type Tracking = Record<string, string>;

/** Tudo que o checkout precisa mandar ao servidor: last-touch com fallback no first-touch + fbp/fbc. */
export function getTracking(): Tracking {
  if (typeof window === "undefined") return {};
  const last = utms();
  const first = readJson(FIRST_KEY);
  const out: Tracking = { ...first, ...last };
  const fbc = localStorage.getItem(FBC_KEY) || readCookie("_fbc");
  const fbp = readCookie("_fbp");
  if (fbc) out["fbc"] = fbc;
  if (fbp) out["fbp"] = fbp;
  for (const [k, v] of Object.entries(first)) out[`first_${k}`] = v;
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
