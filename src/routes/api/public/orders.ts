import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { findProduct } from "@/lib/catalog";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  items: z.array(z.object({ slug: z.string().max(200), qty: z.number().int().min(1).max(20) })).min(1).max(30),
});

/** Cria pedido pendente (PIX). O total é sempre recalculado aqui pelo catálogo — o navegador não define preço. */
export const Route = createFileRoute("/api/public/orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
        const items = parsed.data.items.map((i) => {
          const p = findProduct(i.slug);
          return p ? { slug: p.slug, name: p.name, qty: i.qty, price_cents: p.price } : null;
        });
        if (items.some((i) => !i)) return Response.json({ error: "Produto inválido." }, { status: 400 });
        const valid = items.filter((i): i is NonNullable<typeof i> => !!i);
        const total = valid.reduce((s, i) => s + i.price_cents * i.qty, 0);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("orders").insert({
          customer_name: parsed.data.name,
          customer_phone: parsed.data.phone,
          customer_email: parsed.data.email || null,
          items: valid,
          total_cents: total,
          payment_method: "pix",
          status: "pending",
          tracking: {},
        }).select("id").single();
        if (error) return Response.json({ error: "Não foi possível criar o pedido." }, { status: 500 });
        return Response.json({ id: data.id, total_cents: total });
      },
    },
  },
});
