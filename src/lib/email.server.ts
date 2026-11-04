// E-mails da loja via Resend — SOMENTE servidor (não importe no client).
// Configuração (Lovable → Cloud → Secrets):
//   RESEND_API_KEY  chave criada em resend.com → API Keys
//   RESEND_FROM     remetente com domínio verificado, ex.: byhappy <pedidos@byhappy.com.br>
//   SITE_URL        endereço da loja, ex.: https://byhappy.com.br (para os links do e-mail)
// Sem RESEND_API_KEY nada é enviado e a compra segue normalmente.

import { SUPPORT_WHATSAPP } from "@/components/store/whatsapp-button";

type Kind = "paid" | "shipped";

const BRAND = "#d6408b";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");

function siteUrl(): string {
  return (process.env["SITE_URL"] || "https://byhappyhair.lovable.app").replace(/\/+$/, "");
}

function layout(title: string, body: string): string {
  const wa = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Olá! Tenho uma dúvida sobre meu pedido na byhappy.")}`;
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fdf2f7;font-family:Arial,Helvetica,sans-serif;color:#222">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <p style="text-align:center;margin:0 0 16px;font-size:26px;font-weight:800;color:${BRAND}">byhappy</p>
    <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #f3d3e3">
      <h1 style="margin:0 0 12px;font-size:22px">${title}</h1>
      ${body}
    </div>
    <p style="text-align:center;font-size:12px;color:#777;margin:16px 0 0">
      Dúvidas? <a href="${wa}" style="color:${BRAND};font-weight:bold">Fale com a gente no WhatsApp</a><br/>
      Garantia de 30 dias: se não gostar, devolvemos seu dinheiro.
    </p>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="text-align:center;margin:20px 0 4px"><a href="${href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:12px">${label}</a></p>`;
}

type OrderLike = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  total_cents: number;
  items: unknown;
  tracking: unknown;
};

function buildEmail(kind: Kind, order: OrderLike) {
  const t = asObj(order.tracking);
  const first = escapeHtml((order.customer_name ?? "").trim().split(" ")[0] || "cliente");
  const short = order.id.slice(0, 8).toUpperCase();
  const orderCode = str(t["order_code"]);
  const carrierCode = str(t["tracking_code"]);
  const ship = asObj(t["shipping"]);
  const shipName = str(ship["name"]) || (str(ship["method"]) === "jadlog" ? "Jadlog" : "Correios");
  const shipPrice = typeof ship["price_cents"] === "number" ? (ship["price_cents"] as number) : 0;
  const addr = asObj(t["address"]);
  const address = [
    [str(addr["street"]), str(addr["number"])].filter(Boolean).join(", "),
    str(addr["complement"]),
    str(addr["neighborhood"]),
    [str(addr["city"]), str(addr["state"])].filter(Boolean).join("/"),
    str(addr["cep"]),
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" — ");
  const items = Array.isArray(order.items) ? (order.items as { name?: string; qty?: number }[]) : [];
  const itemsHtml = items
    .map((i) => `<li style="margin:2px 0">${i.qty ?? 1}x ${escapeHtml(i.name ?? "Produto")}</li>`)
    .join("");
  const trackHref = `${siteUrl()}/rastreio?code=${encodeURIComponent(orderCode || short)}`;

  const summary = `
    <div style="background:#fafafa;border-radius:12px;padding:12px 16px;margin:16px 0;font-size:14px">
      <p style="margin:0 0 6px;font-weight:bold">Pedido #${short}</p>
      <ul style="margin:0 0 8px;padding-left:18px">${itemsHtml}</ul>
      <p style="margin:0">Frete: ${escapeHtml(shipName)} — ${shipPrice ? brl(shipPrice) : "Grátis"}</p>
      <p style="margin:4px 0 0">Total pago: <b>${brl(order.total_cents)}</b></p>
      ${address ? `<p style="margin:8px 0 0;color:#555">Entrega em: ${address}</p>` : ""}
    </div>`;

  if (kind === "paid") {
    const codeBox = orderCode
      ? `<p style="margin:0 0 6px">Acabamos de gerar seu código de rastreio:</p>
         <div style="font-size:24px;font-weight:800;letter-spacing:2px;text-align:center;background:#fdf2f7;border:2px dashed ${BRAND};border-radius:12px;padding:12px;color:${BRAND}">${escapeHtml(orderCode)}</div>`
      : "";
    return {
      subject: `Pagamento confirmado! Pedido #${short} 🎉`,
      html: layout(
        `Pagamento confirmado, ${first}! 🎉`,
        `<p style="margin:0 0 16px">Recebemos seu pagamento e seu pedido já entrou na fila de envio imediato.</p>
         ${codeBox}
         ${button(trackHref, "Rastrear meu pedido")}
         ${summary}
         <p style="margin:0;font-size:13px;color:#555">Assim que for postado, você recebe outro e-mail com o código da transportadora.</p>`,
      ),
      text: `Pagamento confirmado, ${first}! Pedido #${short}.${orderCode ? ` Código de rastreio: ${orderCode}.` : ""} Acompanhe em ${trackHref}`,
    };
  }

  return {
    subject: `Seu pedido #${short} foi enviado! 🚚`,
    html: layout(
      `Seu pedido está a caminho, ${first}! 🚚`,
      `<p style="margin:0 0 12px">Seu pedido foi postado via <b>${escapeHtml(shipName)}</b>.</p>
       ${carrierCode ? `<p style="margin:0 0 6px">Código da transportadora:</p><div style="font-size:20px;font-weight:800;letter-spacing:1px;text-align:center;background:#f3f4f6;border-radius:12px;padding:12px">${escapeHtml(carrierCode)}</div>` : ""}
       ${button(trackHref, "Acompanhar entrega")}
       ${summary}`,
    ),
    text: `Seu pedido #${short} foi enviado via ${shipName}.${carrierCode ? ` Código: ${carrierCode}.` : ""} Acompanhe em ${trackHref}`,
  };
}

/**
 * Envia o e-mail do pedido (uma vez por tipo e por código). Registra "email_sent"/"email_failed"
 * em events — esses eventos ficam fora da linha do tempo da aba Eventos.
 */
export async function sendOrderEmail(
  orderId: string,
  kind: Kind,
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { ok: false, skipped: "resend_not_configured" };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: order } = await db
    .from("orders")
    .select("id, customer_name, customer_email, total_cents, items, tracking, status, lead_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "paid") return { ok: false, skipped: "not_paid" };
  if (!order.customer_email) return { ok: false, skipped: "no_email" };

  // Não repete: "paid" uma vez por pedido; "shipped" uma vez por código da transportadora.
  const carrierCode = str(asObj(order.tracking)["tracking_code"]);
  const dedupe = kind === "paid" ? "paid" : `shipped:${carrierCode}`;
  const { data: prev } = await db
    .from("events")
    .select("id")
    .eq("type", "email_sent")
    .eq("data->>order_id", orderId)
    .eq("data->>kind", dedupe)
    .limit(1);
  if (prev?.length) return { ok: true, skipped: "already_sent" };

  const mail = buildEmail(kind, order as OrderLike);
  const from = process.env["RESEND_FROM"] || "byhappy <onboarding@resend.dev>";
  let error: string | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [order.customer_email], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) error = `resend_${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
  } catch (e) {
    error = `resend_unreachable: ${String(e).slice(0, 200)}`;
  }
  await db.from("events").insert({
    type: error ? "email_failed" : "email_sent",
    lead_id: order.lead_id ?? null,
    page: "/email",
    data: { order_id: orderId, kind: dedupe, to: order.customer_email, ...(error ? { error } : {}) },
  });
  if (error) console.error("[email]", error);
  return error ? { ok: false, error } : { ok: true };
}
