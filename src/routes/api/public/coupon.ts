import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { builtinCoupon } from "@/lib/coupon-defaults";

const Q = z.object({
  code: z.string().trim().min(1).max(40),
  subtotal: z.coerce.number().int().min(0).max(10_000_000),
});

/** Pré-validação do cupom no checkout (o /api/public/pix revalida tudo de novo). */
export const Route = createFileRoute("/api/public/coupon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const parsed = Q.safeParse({ code: sp.get("code"), subtotal: sp.get("subtotal") });
        if (!parsed.success) return Response.json({ valid: false }, { status: 400 });
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const code = parsed.data.code.toUpperCase();
        const { data: row } = await db
          .from("coupons")
          .select("code, percent, min_value_cents, active, expires_at")
          .eq("code", code)
          .maybeSingle();
        const c = row ?? builtinCoupon(code);
        const ok =
          !!c &&
          c.active &&
          (!c.expires_at || new Date(c.expires_at) > new Date()) &&
          parsed.data.subtotal >= c.min_value_cents;
        return Response.json(
          ok && c ? { valid: true, code: c.code, percent: Number(c.percent) } : { valid: false },
        );
      },
    },
  },
});
