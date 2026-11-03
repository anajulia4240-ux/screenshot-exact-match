/** Meta Conversions API (somente servidor). Secrets: FB_PIXEL_ID, FB_CAPI_ACCESS_TOKEN. */
import type { Json } from "@/integrations/supabase/types";

const sha = async (v: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const rec = (v: Json | undefined): Record<string, Json | undefined> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : {};
const s = (v: Json | undefined): string => (typeof v === "string" ? v.trim() : "");
const plain = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");

export interface CapiOrder {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total_cents: number;
  items: Json;
  tracking: Json;
  paid_at: string | null;
}

export type CapiResult = { ok: true; http: number } | { ok: false; error: string; http?: number };

/** Envia Purchase (event_id = id do pedido, igual ao eventID do navegador). Nunca lança. */
export async function sendMetaPurchase(order: CapiOrder): Promise<CapiResult> {
  const pixelId = process.env["FB_PIXEL_ID"]?.trim();
  const token = process.env["FB_CAPI_ACCESS_TOKEN"]?.trim();
  if (!pixelId || !token) return { ok: false, error: "capi_not_configured" };
  try {
    const t = rec(order.tracking);
    const addr = rec(t["address"]);
    const cpf = s(rec(t["customer"])["cpf"]).replace(/\D/g, "");
    const parts = (order.customer_name ?? "").trim().split(/\s+/).filter(Boolean);
    let ph = (order.customer_phone ?? "").replace(/\D/g, "");
    if (ph && !ph.startsWith("55")) ph = `55${ph}`;
    const u: Record<string, string> = {};
    const put = async (k: string, v: string) => { if (v) u[k] = await sha(v); };
    await put("em", order.customer_email ?? "");
    await put("ph", ph);
    await put("fn", parts[0] ? plain(parts[0]) : "");
    await put("ln", parts.length > 1 ? plain(parts[parts.length - 1] ?? "") : "");
    await put("ct", plain(s(addr["city"])));
    await put("st", s(addr["state"]));
    await put("zp", s(addr["cep"]).replace(/\D/g, ""));
    await put("country", "br");
    await put("external_id", cpf || order.id);
    const raw: Record<string, string> = {};
    if (s(t["fbp"])) raw["fbp"] = s(t["fbp"]);
    if (s(t["fbc"])) raw["fbc"] = s(t["fbc"]);
    if (s(t["client_ip"])) raw["client_ip_address"] = s(t["client_ip"]);
    if (s(t["client_user_agent"])) raw["client_user_agent"] = s(t["client_user_agent"]);
    const items = Array.isArray(order.items) ? order.items : [];
    const ids = items.map((i) => s(rec(i)["slug"])).filter(Boolean);
    const testCode = s(t["test_event_code"]);
    const body = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(new Date(order.paid_at ?? Date.now()).getTime() / 1000),
          event_id: order.id,
          event_source_url: s(t["event_source_url"]) || "https://byhappyhair.lovable.app/checkout",
          action_source: "website",
          user_data: { ...u, ...raw },
          custom_data: {
            currency: "BRL",
            value: order.total_cents / 100,
            content_ids: ids,
            content_type: "product",
            order_id: order.id,
          },
        },
      ],
      partner_agent: "lovable",
      ...(testCode ? { test_event_code: testCode } : {}),
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal },
    ).finally(() => clearTimeout(timer));
    const text = await res.text().catch(() => "");
    console.log(`[meta] Purchase ${res.status}`, text.slice(0, 300));
    return res.ok ? { ok: true, http: res.status } : { ok: false, error: text.slice(0, 300), http: res.status };
  } catch (e) {
    console.error("[meta] erro", e);
    return { ok: false, error: e instanceof Error ? e.message : "erro" };
  }
}
