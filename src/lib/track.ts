const KEY = "byhappy_sid";
const UTM_KEY = "byhappy_utm";

function utms(): Record<string, string> {
  try {
    const p = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    p.forEach((v, k) => { if (k.startsWith("utm_") || ["campaign_name", "adset_name", "ad_name", "fbclid"].includes(k)) found[k] = v.slice(0, 200); });
    if (Object.keys(found).length) localStorage.setItem(UTM_KEY, JSON.stringify(found));
    return JSON.parse(localStorage.getItem(UTM_KEY) || "{}") as Record<string, string>;
  } catch { return {}; }
}

/** Envia um evento da loja para o painel. Falhas são ignoradas para não atrapalhar a cliente. */
export async function track(type: string, data?: Record<string, string | number>): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/public/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: localStorage.getItem(KEY), type, page: window.location.pathname, referrer: document.referrer, utm: utms(), data }),
      keepalive: true,
    });
    const j = (await res.json()) as { session_id?: string };
    if (j.session_id) localStorage.setItem(KEY, j.session_id);
  } catch { /* ignorado */ }
}
