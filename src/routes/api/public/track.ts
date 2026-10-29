import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const TYPES = ["page_view", "click", "product_view", "add_to_cart", "checkout_opened", "checkout_filling", "pix_generated"] as const;

const Body = z.object({
  session_id: z.string().uuid().nullable().optional(),
  type: z.enum(TYPES),
  page: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  utm: z.record(z.string().max(60), z.string().max(200)).optional(),
  data: z.record(z.string().max(60), z.union([z.string().max(300), z.number()])).optional(),
});

/** Rastreamento público da loja: grava sessão, evento e IP no servidor (sem acesso anônimo às tabelas). */
export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
        const b = parsed.data;
        const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "").trim() || null;
        const ua = request.headers.get("user-agent")?.slice(0, 400) ?? null;
        const now = new Date().toISOString();
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        // Sessão: reaproveita se existir, senão cria.
        let sessionId = b.session_id ?? null;
        if (sessionId) {
          const { data } = await db.from("sessions").update({ last_seen_at: now, current_page: b.page ?? null }).eq("id", sessionId).select("id").maybeSingle();
          if (!data) sessionId = null;
        }
        if (!sessionId) {
          const { data, error } = await db.from("sessions").insert({
            ip, user_agent: ua, referrer: b.referrer || null, current_page: b.page ?? null,
            utm_source: b.utm?.["utm_source"] ?? null, utm_medium: b.utm?.["utm_medium"] ?? null, utm_campaign: b.utm?.["utm_campaign"] ?? null,
          }).select("id").single();
          if (error) return Response.json({ error: "session" }, { status: 500 });
          sessionId = data.id;
        }

        await db.from("events").insert({
          session_id: sessionId, type: b.type, page: b.page ?? null,
          value_cents: typeof b.data?.["value_cents"] === "number" ? b.data.value_cents : null,
          data: { ...(b.utm ?? {}), ...(b.data ?? {}) },
        });

        if (ip) {
          const { data: v } = await db.from("visitor_ips").select("id").eq("ip", ip).maybeSingle();
          if (v) await db.from("visitor_ips").update({ last_seen_at: now, last_page: b.page ?? null }).eq("id", v.id);
          else await db.from("visitor_ips").insert({ ip, first_page: b.page ?? null, last_page: b.page ?? null });
        }
        return Response.json({ session_id: sessionId });
      },
    },
  },
});
