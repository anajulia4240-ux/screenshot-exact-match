import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { builtinCoupon } from "@/lib/coupon-defaults";
import { DEFAULT_SHIPPING, shippingById } from "@/lib/shipping";
import { findProduct, priceFor } from "@/lib/catalog";
import { isValidCpf, isValidPhone, onlyDigits, phoneE164 } from "@/lib/br";

const Body = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  session_id: z.string().uuid().nullable().optional(),
  customer: z.object({
    name: z.string().trim().min(5).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(10).max(30),
    cpf: z.string().trim().min(11).max(20),
  }),
  address: z.object({
    cep: z.string().trim().min(8).max(10),
    street: z.string().trim().min(2).max(200),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(120).optional(),
    neighborhood: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2).max(120),
    state: z.string().trim().length(2),
  }),
  coupon: z.string().trim().max(40).optional(),
  shipping: z.enum(["gratis", "sedex", "jadlog"]).optional(),
  items: z
    .array(z.object({ slug: z.string().max(200), qty: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
  tracking: z.record(z.string().max(60), z.string().max(300)).optional(),
});

/**
 * Gera o PIX: recalcula o total pelo catálogo, revalida o cupom no banco, cria o pedido,
 * chama a Fruitfy e avisa a Utmify (pendente) sem atrasar o QR Code.
 */
export const Route = createFileRoute("/api/public/pix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ error: "Confira os dados preenchidos." }, { status: 400 });
        const b = parsed.data;
        if (!isValidCpf(b.customer.cpf))
          return Response.json({ error: "CPF inválido." }, { status: 400 });
        if (!isValidPhone(b.customer.phone))
          return Response.json({ error: "WhatsApp inválido." }, { status: 400 });

        // Preço vem do painel (aba Preços); se não houver, usa o padrão do catálogo.
        const { loadPriceMap } = await import("@/lib/prices.server");
        const priceMap = await loadPriceMap();
        const items = b.items.map((i) => {
          const p = findProduct(i.slug);
          return p ? { slug: p.slug, name: p.name, qty: i.qty, price_cents: priceFor(p.slug, priceMap).price } : null;
        });
        if (items.some((i) => !i))
          return Response.json({ error: "Produto inválido." }, { status: 400 });
        const valid = items.filter((i): i is NonNullable<typeof i> => !!i);
        const subtotal = valid.reduce((s, i) => s + i.price_cents * i.qty, 0);

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const pay = await import("@/lib/payments.server");

        // Cupom: percentual vem SEMPRE do banco.
        let couponCode: string | null = null;
        let discount = 0;
        if (b.coupon) {
          const code = b.coupon.toUpperCase();
          const { data: row } = await db
            .from("coupons")
            .select("code, percent, min_value_cents, active, expires_at")
            .eq("code", code)
            .maybeSingle();
          // HAPPY10 (cupom de identificação) vale mesmo sem cadastro na aba Cupons.
          const c = row ?? builtinCoupon(code);
          const ok =
            c &&
            c.active &&
            (!c.expires_at || new Date(c.expires_at) > new Date()) &&
            subtotal >= c.min_value_cents;
          if (!ok) return Response.json({ error: "Cupom inválido ou expirado." }, { status: 400 });
          couponCode = c.code;
          discount = Math.round((subtotal * Number(c.percent)) / 100);
        }
        // Frete: valor vem SEMPRE da tabela do servidor (1 opção grátis + 2 pagas).
        const ship = shippingById(b.shipping ?? DEFAULT_SHIPPING);
        const total = subtotal - discount + ship.price_cents;
        if (total < 100)
          return Response.json({ error: "Valor do pedido inválido." }, { status: 400 });

        const ip = (
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0] ||
          ""
        ).trim();
        const ua = request.headers.get("user-agent")?.slice(0, 400) ?? "";
        const cpf = onlyDigits(b.customer.cpf);
        const phone = phoneE164(b.customer.phone);
        const email = b.customer.email.toLowerCase();
        const utm = b.tracking ?? {};
        const tracking = {
          ...utm,
          client_ip: ip,
          client_user_agent: ua,
          customer: { cpf },
          address: { ...b.address, cep: onlyDigits(b.address.cep) },
          shipping: { method: ship.id, name: ship.name, price_cents: ship.price_cents },
          ...(couponCode ? { coupon: { code: couponCode, discount_cents: discount } } : {}),
          subtotal_cents: subtotal,
        };

        const { data: order, error } = await db
          .from("orders")
          .insert({
            lead_id: b.lead_id ?? null,
            customer_name: b.customer.name,
            customer_phone: phone,
            customer_email: email,
            items: valid,
            total_cents: total,
            payment_method: "pix",
            status: "pending",
            coupon_code: couponCode,
            tracking,
          })
          .select(
            "id, lead_id, customer_name, customer_phone, customer_email, total_cents, items, tracking, created_at, paid_at",
          )
          .single();
        if (error || !order)
          return Response.json({ error: "Não foi possível criar o pedido." }, { status: 500 });

        let charge;
        try {
          charge = await pay.createFruitfyCharge({
            name: b.customer.name,
            email,
            cpf,
            phone,
            amount_cents: total,
            utm,
          });
        } catch (e) {
          const msg =
            e instanceof pay.PaymentError ? e.message : "Não foi possível gerar o PIX agora.";
          await db
            .from("orders")
            .update({ notes: `Falha ao gerar PIX: ${msg}` })
            .eq("id", order.id);
          await db
            .from("events")
            .insert({
              type: "pix_failed",
              lead_id: b.lead_id ?? null,
              session_id: b.session_id ?? null,
              page: "/checkout",
              value_cents: total,
              data: {
                order_id: order.id,
                error: msg,
                detail: JSON.stringify(e instanceof pay.PaymentError ? e.detail : String(e)).slice(
                  0,
                  1000,
                ),
              },
            });
          return Response.json({ error: msg }, { status: 502 });
        }

        const payment = {
          gateway: "fruitfy",
          transaction_id: charge.transaction_id,
          pix_code: charge.pix_code,
          expires_at: charge.expires_at,
        };
        const withPayment = { ...order, tracking: { ...tracking, payment } };
        // O transaction_id precisa estar salvo antes de responder (webhook e polling dependem dele).
        await db.from("orders").update({ tracking: withPayment.tracking }).eq("id", order.id);
        // Evento + Utmify (pendente) com limite de 3s para nunca atrasar o QR Code.
        await pay.withTimeout(
          Promise.all([
            db
              .from("events")
              .insert({
                type: "pix_generated",
                lead_id: b.lead_id ?? null,
                session_id: b.session_id ?? null,
                page: "/checkout",
                value_cents: total,
                data: { order_id: order.id, transaction_id: charge.transaction_id, ...utm },
              }),
            pay.notifyUtmify(withPayment, "waiting_payment"),
          ]),
          3000,
        );

        return Response.json({
          order_id: order.id,
          total_cents: total,
          discount_cents: discount,
          pix_code: charge.pix_code,
          qr_image: charge.qr_image,
          expires_at: charge.expires_at,
        });
      },
    },
  },
});
