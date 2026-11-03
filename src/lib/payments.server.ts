/**
 * Pagamentos (somente servidor): Fruitfy (PIX) + Utmify (vendas) + baixa de pedido pago.
 * Secrets: FRUITFY_API_TOKEN, FRUITFY_STORE_UUID, FRUITFY_PRODUCT_ID, UTMIFY_API_TOKEN.
 * Nada daqui pode ir para o navegador.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

const FRUITFY_BASE = "https://api.fruitfy.io/api";
const UTMIFY_URL = "https://api.utmify.com.br/api-credentials/orders";
const PLATFORM = "byhappy";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function fruitfyHeaders(): Record<string, string> {
  const token = env("FRUITFY_API_TOKEN");
  const store = env("FRUITFY_STORE_UUID");
  if (!token || !store)
    throw new PaymentError("Pagamento indisponível: credenciais da Fruitfy não configuradas.", 500);
  return {
    Authorization: `Bearer ${token}`,
    "Store-Id": store,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "pt_BR",
  };
}

/** Procura a primeira chave (em qualquer nível) com valor string não vazio. */
function deepFind(
  obj: unknown,
  keys: string[],
  ok: (v: string) => boolean = () => true,
): string | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [obj];
  // Busca em largura: campos mais rasos ganham.
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const rec = cur as Record<string, unknown>;
    for (const k of keys) {
      const v = rec[k];
      if (typeof v === "string" && v.trim() && ok(v.trim())) return v.trim();
      if (typeof v === "number" && ok(String(v))) return String(v);
    }
    for (const v of Object.values(rec)) if (v && typeof v === "object") queue.push(v);
  }
  return null;
}

export interface PixCharge {
  transaction_id: string;
  pix_code: string;
  qr_image: string | null;
  expires_at: string | null;
  raw_status: string | null;
}

export interface ChargeInput {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  amount_cents: number;
  utm: Record<string, string>;
}

/** Cria a cobrança PIX na Fruitfy. Um item só (produto de cobrança comum) com o total do pedido. */
export async function createFruitfyCharge(input: ChargeInput): Promise<PixCharge> {
  const productId = env("FRUITFY_PRODUCT_ID");
  if (!productId)
    throw new PaymentError("Pagamento indisponível: produto da Fruitfy não configurado.", 500);
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = input.utm[k];
    if (v) utm[k] = v;
  }
  const res = await fetch(`${FRUITFY_BASE}/pix/charge`, {
    method: "POST",
    headers: fruitfyHeaders(),
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone,
      items: [{ id: productId, value: input.amount_cents, quantity: 1 }],
      ...(Object.keys(utm).length ? { utm } : {}),
    }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = deepFind(body, ["message"]) ?? `HTTP ${res.status}`;
    console.error("[fruitfy] charge failed", res.status, JSON.stringify(body)?.slice(0, 2000));
    if (res.status === 401 || res.status === 403)
      throw new PaymentError("Pagamento indisponível no momento (credencial recusada).", 502, body);
    throw new PaymentError(
      res.status === 422
        ? `Dados recusados pelo pagamento: ${msg}`
        : "Não foi possível gerar o PIX agora. Tente de novo.",
      502,
      body,
    );
  }
  console.log("[fruitfy] charge ok", JSON.stringify(body)?.slice(0, 2000));
  const pixCode = deepFind(
    body,
    [
      "copy_paste",
      "copia_e_cola",
      "pix_code",
      "qr_code",
      "qrcode",
      "emv",
      "payload",
      "brcode",
      "br_code",
      "code",
    ],
    (v) => v.startsWith("000201"),
  );
  const id = deepFind(body, ["order_uuid", "order_id", "uuid", "id", "transaction_id"]);
  if (!pixCode) {
    throw new PaymentError("PIX gerado sem código. Tente novamente.", 502, body);
  }
  if (!id) throw new PaymentError("PIX gerado sem identificador do pedido.", 502, body);
  let img = deepFind(
    body,
    [
      "qr_code_base64",
      "qrcode_base64",
      "qr_code_image",
      "qr_code_url",
      "qr_code",
      "image",
      "image_url",
    ],
    (v) =>
      !v.startsWith("000201") && (v.length > 200 || v.startsWith("http") || v.startsWith("data:")),
  );
  if (img && !img.startsWith("data:") && !img.startsWith("http"))
    img = `data:image/png;base64,${img}`;
  return {
    transaction_id: id,
    pix_code: pixCode,
    qr_image: img,
    expires_at: deepFind(body, ["expires_at", "expiration", "expiration_date"]),
    raw_status: deepFind(body, ["status"]),
  };
}

/** Consulta o pedido na Fruitfy. Fonte da verdade do status (webhook e polling usam isto). */
export async function getFruitfyOrder(
  transactionId: string,
): Promise<{ status: string | null; paid_at: string | null }> {
  const res = await fetch(`${FRUITFY_BASE}/order/${encodeURIComponent(transactionId)}`, {
    headers: fruitfyHeaders(),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[fruitfy] order lookup failed", res.status, JSON.stringify(body)?.slice(0, 500));
    return { status: null, paid_at: null };
  }
  const data = (body as { data?: unknown } | null)?.data ?? body;
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const status = typeof rec["status"] === "string" ? rec["status"].toLowerCase() : null;
  const paidAt = typeof rec["paid_at"] === "string" ? rec["paid_at"] : null;
  return { status, paid_at: paidAt };
}

export const isPaidStatus = (s: string | null | undefined, paidAt?: string | null): boolean =>
  !!paidAt || ["paid", "approved", "completed"].includes((s ?? "").toLowerCase());

// ---------- Utmify ----------

type OrderRow = {
  id: string;
  lead_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total_cents: number;
  items: Json;
  tracking: Json;
  created_at: string;
  paid_at: string | null;
};

const utcStamp = (iso: string): string =>
  new Date(iso).toISOString().replace("T", " ").slice(0, 19);
const asRecord = (v: Json | undefined): Record<string, Json | undefined> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : {};
const str = (v: Json | undefined): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Formato "nome|id" que a Utmify usa pra ligar a venda ao anúncio (mesma regra da loja Gummy). */
function utmifyPair(nameRaw: Json | undefined, idRaw: Json | undefined, fallbackRaw: Json | undefined): string | null {
  const id = (str(idRaw) ?? "").replace(/\D/g, "");
  let name = str(nameRaw) ?? str(fallbackRaw) ?? "";
  if (name.includes("|")) {
    const [l = "", r = ""] = name.split("|").map((p) => p.trim());
    if (l && r) return `${l}|${r}`;
    name = l || r;
  }
  if (name && id) return name === id ? id : `${name}|${id}`;
  return id || name || null;
}

/** Se o pedido veio sem UTM, recupera a campanha do lead/sessão e salva no pedido. */
async function ensureTracking(order: OrderRow): Promise<Record<string, Json | undefined>> {
  const tracking = asRecord(order.tracking);
  if (str(tracking["utm_campaign"]) || str(tracking["utm_source"])) return tracking;
  const fill: Record<string, string> = {};
  if (order.lead_id) {
    const { data: lead } = await db
      .from("leads")
      .select("utm_source, utm_medium, utm_campaign")
      .eq("id", order.lead_id)
      .maybeSingle();
    if (lead?.utm_source) fill["utm_source"] = lead.utm_source;
    if (lead?.utm_medium) fill["utm_medium"] = lead.utm_medium;
    if (lead?.utm_campaign) fill["utm_campaign"] = lead.utm_campaign;
    if (!fill["utm_campaign"]) {
      const { data: s } = await db
        .from("sessions")
        .select("utm_source, utm_medium, utm_campaign")
        .eq("lead_id", order.lead_id)
        .not("utm_campaign", "is", null)
        .order("started_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (s?.utm_source) fill["utm_source"] = s.utm_source;
      if (s?.utm_medium) fill["utm_medium"] = s.utm_medium;
      if (s?.utm_campaign) fill["utm_campaign"] = s.utm_campaign;
    }
  }
  if (!fill["utm_campaign"] && (order.customer_email || order.customer_phone)) {
    let q = db
      .from("leads")
      .select("utm_source, utm_medium, utm_campaign")
      .not("utm_campaign", "is", null)
      .order("created_at", { ascending: true })
      .limit(1);
    q = order.customer_email
      ? q.eq("email", order.customer_email)
      : q.eq("phone", order.customer_phone ?? "");
    const { data: l } = await q.maybeSingle();
    if (l?.utm_campaign)
      Object.assign(fill, {
        utm_source: l.utm_source ?? "",
        utm_medium: l.utm_medium ?? "",
        utm_campaign: l.utm_campaign,
      });
  }
  if (!Object.keys(fill).length) return tracking;
  const merged = { ...tracking, ...fill, utm_recovered: "lead" };
  await db
    .from("orders")
    .update({ tracking: merged as Json })
    .eq("id", order.id);
  return merged;
}

/** Envia o pedido para a Utmify. Mesmo orderId no pendente e no pago. Nunca quebra o checkout. */
export async function notifyUtmify(
  order: OrderRow,
  status: "waiting_payment" | "paid",
): Promise<void> {
  const token = env("UTMIFY_API_TOKEN");
  if (!token) {
    console.warn("[utmify] UTMIFY_API_TOKEN ausente — envio ignorado");
    return;
  }
  if (!(order.total_cents > 0)) return;
  try {
    const t = await ensureTracking(order);
    const payment = asRecord(t["payment"]);
    const customer = asRecord(t["customer"]);
    const createdAt = utcStamp(order.created_at);
    const items = Array.isArray(order.items) ? order.items : [];
    const products = items.map((it, i) => {
      const r = asRecord(it);
      const qty = typeof r["qty"] === "number" ? r["qty"] : 1;
      const price = typeof r["price_cents"] === "number" ? r["price_cents"] : 0;
      return {
        id: str(r["slug"]) ?? `item-${i}`,
        name: str(r["name"]) ?? "Produto",
        planId: null,
        planName: null,
        quantity: qty,
        priceInCents: price,
      };
    });
    const body = {
      orderId: str(payment["transaction_id"]) ?? order.id,
      platform: PLATFORM,
      paymentMethod: "pix",
      status,
      createdAt,
      approvedDate: status === "paid" ? utcStamp(order.paid_at ?? new Date().toISOString()) : null,
      refundedAt: null,
      customer: {
        name: order.customer_name ?? "",
        email: order.customer_email ?? "",
        phone: order.customer_phone ?? null,
        document: str(customer["cpf"]),
        country: "BR",
        ip: str(t["client_ip"]) ?? "0.0.0.0",
      },
      products: products.length
        ? products
        : [
            {
              id: order.id,
              name: "Pedido byhappy",
              planId: null,
              planName: null,
              quantity: 1,
              priceInCents: order.total_cents,
            },
          ],
      trackingParameters: {
src: str(t["src"]) ?? str(t["utm_source"]),
sck: str(t["sck"]),
utm_source: str(t["utm_source"]),
utm_campaign: utmifyPair(t["campaign_name"], t["campaign_id"], t["utm_campaign"]),
utm_medium: utmifyPair(t["adset_name"], t["adset_id"], t["utm_medium"]),
utm_content: utmifyPair(t["ad_name"], t["ad_id"], t["utm_content"]),
// utm_term = posicionamento (Feed, Stories...), como na Gummy
utm_term: str(t["placement"]) ?? str(t["site_source_name"]) ?? str(t["utm_term"]),
},
      commission: {
        totalPriceInCents: order.total_cents,
        gatewayFeeInCents: 0,
        userCommissionInCents: order.total_cents,
      },
      isTest: false,
    };
    const res = await fetch(UTMIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": token },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    console.log(`[utmify] ${status} ${res.status}`, text.slice(0, 500));
    await db
      .from("events")
      .insert({
        type: res.ok ? "utmify_sent" : "utmify_failed",
        value_cents: order.total_cents,
        data: { status, http: res.status, order_id: order.id, response: text.slice(0, 300) },
      });
  } catch (e) {
    console.error("[utmify] erro", e);
  }
}

export const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

const ORDER_COLS =
  "id, lead_id, customer_name, customer_phone, customer_email, total_cents, items, tracking, created_at, paid_at, status";

/** Marca pedido como pago (idempotente) e avisa a Utmify com o valor salvo no pedido. */
export async function markOrderPaid(
  orderId: string,
  by: "gateway" | "manual" = "gateway",
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: updated } = await db
    .from("orders")
    .update({ status: "paid", paid_at: now, confirmed_by: by })
    .eq("id", orderId)
    .eq("status", "pending")
    .select(ORDER_COLS)
    .maybeSingle();
  if (!updated) return false; // já estava pago (ou não existe): não reprocessa
  await db
    .from("events")
    .insert({
      type: "pix_paid",
      lead_id: updated.lead_id,
      value_cents: updated.total_cents,
      data: { order_id: orderId, by },
    });
  await Promise.all([notifyUtmify(updated, "paid"), sendMetaForOrder(orderId, updated)]);
  return true;
}

/** Purchase na Meta CAPI (idempotente por meta_sent). Falha nunca trava o PIX. */
export async function sendMetaForOrder(
  orderId: string,
  preloaded?: Awaited<ReturnType<typeof loadOrder>>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const order = preloaded ?? (await loadOrder(orderId));
    if (!order || order.status !== "paid") return { ok: false, error: "not_paid" };
    const { data: prev } = await db
      .from("events")
      .select("id")
      .eq("type", "meta_sent")
      .eq("data->>order_id", orderId)
      .limit(1);
    if (prev?.length) return { ok: true };
    const { sendMetaPurchase } = await import("@/lib/meta-capi.server");
    const r = await sendMetaPurchase(order);
    if (!r.ok && r.error === "capi_not_configured") {
      console.warn("[meta] FB_CAPI_ACCESS_TOKEN/FB_PIXEL_ID ausente — envio ignorado");
      return { ok: false, error: r.error };
    }
    await db.from("events").insert({
      type: r.ok ? "meta_sent" : "meta_failed",
      value_cents: order.total_cents,
      data: { order_id: orderId, http: r.http ?? null, error: r.ok ? null : r.error },
    });
    return r.ok ? { ok: true } : { ok: false, error: "meta_failed" };
  } catch (e) {
    console.error("[meta] erro", e);
    return { ok: false, error: "meta_failed" };
  }
}

export async function loadOrder(orderId: string) {
  const { data } = await db.from("orders").select(ORDER_COLS).eq("id", orderId).maybeSingle();
  return data;
}

export async function findOrderByTransaction(transactionId: string) {
  const { data } = await db
    .from("orders")
    .select(ORDER_COLS)
    .eq("tracking->payment->>transaction_id", transactionId)
    .maybeSingle();
  return data;
}
