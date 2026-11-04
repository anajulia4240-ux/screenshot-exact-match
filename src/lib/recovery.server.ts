// Recuperação de vendas por e-mail (Resend) — SOMENTE servidor.
//
// 1) Checkout abandonado: a cliente informou o e-mail no checkout e, 5 min depois,
//    não gerou PIX. Recebe "Seu kit está te esperando" com os itens do carrinho,
//    o cupom HAPPY10 e um botão que remonta o carrinho.
// 2) PIX não pago: gerou o PIX e, 5 min depois, não pagou. Recebe "Seu pedido está
//    reservado" com o PIX copia-e-cola (se ainda valer) e o botão para finalizar.
//
// Cada e-mail sai uma vez só (registro em events: email_sent / email_failed).
// Roda pelo /api/public/recovery-run (agendado) e também "de carona" nas visitas da loja,
// no máximo a cada 1 minuto.

import { findProduct } from "@/lib/catalog";
import { IDENTIFICATION_COUPON } from "@/lib/coupon-defaults";
import {
  asObj,
  brl,
  button,
  deliverEmail,
  escapeHtml,
  layout,
  siteUrl,
  str,
} from "./email.server";

const MIN = 60 * 1000;
const CHECKOUT_AFTER_MS = 5 * MIN;
const PIX_AFTER_MS = 5 * MIN;
const MAX_AGE_MS = 48 * 60 * MIN;
const MAX_EMAILS_PER_RUN = 25;
const LAST_RUN_KEY = "recovery_last_run";
const THROTTLE_MS = 1 * MIN;

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Line = { slug: string; name: string; qty: number; price: number; image?: string };

const UTM = "utm_source=email&utm_medium=recuperacao";

function cartLink(lines: { slug: string; qty: number }[], campaign: string): string {
  const kit = lines.map((l) => `${l.slug}:${l.qty}`).join(",");
  const q = kit ? `kit=${encodeURIComponent(kit)}&` : "";
  return lines.length
    ? `${siteUrl()}/checkout?${q}${UTM}&utm_campaign=${campaign}`
    : `${siteUrl()}/?${UTM}&utm_campaign=${campaign}#kits`;
}

function itemsHtml(lines: Line[]): string {
  if (!lines.length) return "";
  const rows = lines
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;width:64px">${
          l.image ? `<img src="${/^https?:/.test(l.image) ? l.image : siteUrl() + l.image}" width="56" height="56" alt="" style="border-radius:10px;border:1px solid #eee;display:block"/>` : ""
        }</td>
        <td style="padding:8px 0 8px 10px;font-size:14px">${l.qty}x ${escapeHtml(l.name)}<br/><b style="color:#d6408b">${brl(l.price)}</b></td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0">${rows}</table>`;
}

function toLines(raw: { slug: string; qty: number }[]): Line[] {
  const out: Line[] = [];
  for (const r of raw) {
    const p = findProduct(r.slug);
    if (p) out.push({ slug: p.slug, name: p.name, qty: r.qty, price: p.price, image: p.image });
  }
  return out;
}

async function alreadySent(db: Db, kind: string): Promise<boolean> {
  const { data } = await db.from("events").select("id").eq("type", "email_sent").eq("data->>kind", kind).limit(1);
  return !!data?.length;
}

async function record(db: Db, ok: boolean, kind: string, to: string, leadId: string | null, extra: Record<string, string> = {}) {
  await db.from("events").insert({
    type: ok ? "email_sent" : "email_failed",
    lead_id: leadId,
    page: "/email",
    data: { kind, to, ...extra },
  });
}

/** Itens que a cliente colocou no carrinho (eventos add_to_cart das sessões dela). */
async function cartOfLead(db: Db, leadId: string): Promise<{ slug: string; qty: number }[]> {
  const { data: sess } = await db.from("sessions").select("id").eq("lead_id", leadId).limit(20);
  const ids = (sess ?? []).map((s) => s.id);
  let q = db.from("events").select("data, session_id, lead_id").eq("type", "add_to_cart").order("created_at", { ascending: false }).limit(30);
  q = ids.length ? q.or(`lead_id.eq.${leadId},session_id.in.(${ids.join(",")})`) : q.eq("lead_id", leadId);
  const { data } = await q;
  const count = new Map<string, number>();
  for (const e of data ?? []) {
    const slug = str(asObj(e.data)["slug"]);
    if (slug) count.set(slug, (count.get(slug) ?? 0) + 1);
  }
  // Um kit por item (é o que a maioria compra); a cliente ajusta no checkout.
  return [...count.keys()].slice(0, 3).map((slug) => ({ slug, qty: 1 }));
}

async function checkoutAbandoned(db: Db, budget: number): Promise<number> {
  const now = Date.now();
  const { data: leads } = await db
    .from("leads")
    .select("id, name, email, last_seen_at")
    .not("email", "is", null)
    .lt("last_seen_at", new Date(now - CHECKOUT_AFTER_MS).toISOString())
    .gt("last_seen_at", new Date(now - MAX_AGE_MS).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(60);
  let sent = 0;
  for (const lead of leads ?? []) {
    if (sent >= budget) break;
    const email = str(lead.email).trim().toLowerCase();
    if (!email || /@exemplo\.com$|@example\.com$/.test(email)) continue;
    const kind = `abandon_checkout:${lead.id}`;
    if (await alreadySent(db, kind)) continue;
    // Gerou PIX (cai no fluxo 2) ou já comprou com esse e-mail: não manda.
    const { data: orders } = await db
      .from("orders")
      .select("id")
      .or(`lead_id.eq.${lead.id},customer_email.eq.${email}`)
      .gte("created_at", new Date(new Date(lead.last_seen_at).getTime() - 60 * MIN).toISOString())
      .limit(1);
    if (orders?.length) continue;

    const lines = toLines(await cartOfLead(db, lead.id));
    const first = escapeHtml(str(lead.name).trim().split(" ")[0] || "");
    const href = cartLink(lines, "checkout_abandonado");
    const html = layout(
      `${first ? `${first}, s` : "S"}eu pedido ficou guardado`,
      `<p style="margin:0 0 12px">Notamos que você começou sua compra, mas ela não foi concluída. Separamos os itens para você finalizar com tranquilidade, sem precisar começar de novo.</p>
       ${itemsHtml(lines)}
       <table role="presentation" width="100%" style="margin:16px 0;border:1px dashed ${"#d6408b"};border-radius:12px;background:#fdf2f7"><tr><td style="padding:14px;text-align:center">
         <div style="font-size:13px;color:#555">Cupom exclusivo para concluir seu pedido</div>
         <div style="margin-top:6px;font-size:22px;font-weight:800;letter-spacing:3px;color:#d6408b">${IDENTIFICATION_COUPON.code}</div>
         <div style="font-size:13px;color:#555">${IDENTIFICATION_COUPON.percent}% de desconto aplicado no checkout</div>
       </td></tr></table>
       ${button(href, "Concluir meu pedido")}
       <p style="margin:14px 0 0;font-size:13px;color:#666;text-align:center">Estoque limitado — a reserva dos itens não é garantida por muito tempo.</p>`,
      `Seus itens estão separados e você ainda tem ${IDENTIFICATION_COUPON.percent}% de desconto para finalizar.`,
    );
    const text = `${first ? `${first}, s` : "S"}eu pedido ficou guardado. Finalize com ${IDENTIFICATION_COUPON.percent}% de desconto usando o cupom ${IDENTIFICATION_COUPON.code}: ${href}`;
    const err = await deliverEmail({ to: email, subject: `${first ? `${first}, s` : "S"}eu pedido na byhappy ficou guardado`, html, text });
    await record(db, !err, kind, email, lead.id, err ? { error: err } : {});
    if (!err) sent++;
  }
  return sent;
}

async function pixPending(db: Db, budget: number): Promise<number> {
  const now = Date.now();
  const { data: orders } = await db
    .from("orders")
    .select("id, lead_id, customer_name, customer_email, total_cents, items, tracking, created_at, coupon_code")
    .eq("status", "pending")
    .not("customer_email", "is", null)
    .lt("created_at", new Date(now - PIX_AFTER_MS).toISOString())
    .gt("created_at", new Date(now - MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(60);
  let sent = 0;
  for (const o of orders ?? []) {
    if (sent >= budget) break;
    const email = str(o.customer_email).trim().toLowerCase();
    if (!email || /@exemplo\.com$|@example\.com$/.test(email)) continue;
    const kind = `pix_pending:${o.id}`;
    if (await alreadySent(db, kind)) continue;
    // Já pagou outro pedido depois deste: não incomoda.
    const { data: paid } = await db
      .from("orders")
      .select("id")
      .eq("customer_email", email)
      .eq("status", "paid")
      .gte("created_at", o.created_at)
      .limit(1);
    if (paid?.length) continue;
    // Só um lembrete por cliente por dia (quem gerou vários PIX recebe um e-mail).
    const { data: recent } = await db
      .from("events")
      .select("id")
      .eq("type", "email_sent")
      .eq("data->>to", email)
      .like("data->>kind", "pix_pending:%")
      .gte("created_at", new Date(now - 24 * 60 * MIN).toISOString())
      .limit(1);
    if (recent?.length) continue;

    const raw = Array.isArray(o.items) ? (o.items as { slug?: string; qty?: number }[]) : [];
    const lines = toLines(raw.filter((i) => i.slug).map((i) => ({ slug: i.slug as string, qty: i.qty ?? 1 })));
    const pay = asObj(asObj(o.tracking)["payment"]);
    const pixCode = str(pay["pix_code"]);
    const expiresAt = str(pay["expires_at"]);
    const pixValid = !!pixCode && (!expiresAt || new Date(expiresAt).getTime() > now + 2 * MIN);
    const first = escapeHtml(str(o.customer_name).trim().split(" ")[0] || "");
    const href = cartLink(lines, "pix_pendente");
    const short = o.id.slice(0, 8).toUpperCase();
    const pixBox = pixValid
      ? `<p style="margin:16px 0 6px;font-size:14px"><b>Seu PIX ainda está válido.</b> Copie o código abaixo e cole no aplicativo do seu banco, na opção PIX Copia e Cola:</p>
         <div style="font-family:monospace;font-size:11px;word-break:break-all;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:10px;padding:12px">${escapeHtml(pixCode)}</div>`
      : `<p style="margin:16px 0 0;font-size:14px">O código PIX anterior expirou. Gere um novo em poucos segundos pelo botão abaixo.</p>`;
    const html = layout(
      `${first ? `${first}, s` : "S"}eu pedido #${short} aguarda pagamento`,
      `<p style="margin:0 0 8px">Seu pedido de <b>${brl(o.total_cents)}</b> está reservado em seu nome. Falta apenas confirmar o pagamento para enviarmos.</p>
       ${itemsHtml(lines)}
       ${pixBox}
       ${button(href, pixValid ? "Gerar novo PIX" : "Finalizar pagamento")}
       <p style="margin:14px 0 0;font-size:13px;color:#666;text-align:center">Após a aprovação do PIX, você recebe o código de rastreio na hora e o envio é imediato.</p>`,
      `Pedido #${short} reservado — conclua o PIX para liberar o envio imediato.`,
    );
    const text = `Seu pedido #${short} (${brl(o.total_cents)}) está reservado. ${pixValid ? `PIX copia e cola: ${pixCode}. ` : ""}Finalize em: ${href}`;
    const err = await deliverEmail({ to: email, subject: `Pedido #${short} aguardando pagamento — byhappy`, html, text });
    await record(db, !err, kind, email, o.lead_id ?? null, { order_id: o.id, ...(err ? { error: err } : {}) });
    if (!err) sent++;
  }
  return sent;
}

/** Roda os dois fluxos. Com `throttle`, só roda se a última execução foi há mais de 5 min. */
export async function runRecovery(opts: { throttle?: boolean } = {}): Promise<{ ran: boolean; checkout: number; pix: number }> {
  if (!process.env["RESEND_API_KEY"]) return { ran: false, checkout: 0, pix: 0 };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  if (opts.throttle) {
    const { data: last } = await db.from("app_settings").select("value, updated_at").eq("key", LAST_RUN_KEY).maybeSingle();
    if (last?.updated_at && Date.now() - new Date(last.updated_at).getTime() < THROTTLE_MS) {
      return { ran: false, checkout: 0, pix: 0 };
    }
  }
  await db.from("app_settings").upsert({ key: LAST_RUN_KEY, value: { at: nowIso }, updated_at: nowIso }, { onConflict: "key" });
  const pix = await pixPending(db, MAX_EMAILS_PER_RUN);
  const checkout = await checkoutAbandoned(db, MAX_EMAILS_PER_RUN - pix);
  return { ran: true, checkout, pix };
}
