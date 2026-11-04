// Código de rastreio da loja (ex.: BHY7K2M9QX4P), gerado assim que o pagamento é aprovado.
// Funciona na página /rastreio da byhappy. O código da transportadora (Correios/Jadlog)
// continua separado em tracking.tracking_code e aparece quando o pedido é postado.

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genOrderCode(): string {
  let s = "";
  for (let i = 0; i < 9; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return `BHY${s}`;
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Devolve o código do pedido pago, criando-o na primeira vez (idempotente). */
export async function ensureOrderCode(orderId: string): Promise<string | null> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("orders").select("status, tracking").eq("id", orderId).maybeSingle();
  if (!data || data.status !== "paid") return null;
  const t = asObj(data.tracking);
  if (typeof t["order_code"] === "string" && t["order_code"]) return t["order_code"] as string;

  let code: string | null = null;
  for (let i = 0; i < 5 && !code; i++) {
    const c = genOrderCode();
    const { data: dup } = await db.from("orders").select("id").eq("tracking->>order_code", c).limit(1);
    if (!dup?.length) code = c;
  }
  if (!code) code = `BHY${Date.now().toString(36).toUpperCase()}`;

  // Só grava se ainda não existir código (evita dois códigos em consultas simultâneas).
  await db
    .from("orders")
    .update({ tracking: { ...t, order_code: code, order_code_at: new Date().toISOString() } })
    .eq("id", orderId)
    .is("tracking->>order_code", null);

  const { data: after } = await db.from("orders").select("tracking").eq("id", orderId).maybeSingle();
  const saved = asObj(after?.tracking)["order_code"];
  return typeof saved === "string" ? saved : code;
}
