import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  session_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  // A etapa Identificação pede só nome + WhatsApp; o e-mail chega depois, no pagamento.
  email: z.string().trim().email().max(200).optional(),
  utm: z.record(z.string().max(60), z.string().max(200)).optional(),
});

/** Checkout: grava/atualiza o lead na hora (recuperação por WhatsApp/e-mail e campanha). */
export const Route = createFileRoute("/api/public/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
        const b = parsed.data;
        const ip =
          (
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0] ||
            ""
          ).trim() || null;
        const ua = request.headers.get("user-agent")?.slice(0, 400) ?? null;
        const now = new Date().toISOString();
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        const base = {
          name: b.name,
          phone: b.phone,
          ...(b.email ? { email: b.email.toLowerCase() } : {}),
          ip,
          user_agent: ua,
          last_seen_at: now,
        };
        // UTMs: só preenche, nunca apaga um valor existente com vazio.
        const utm = {
          ...(b.utm?.["utm_source"] ? { utm_source: b.utm["utm_source"] } : {}),
          ...(b.utm?.["utm_medium"] ? { utm_medium: b.utm["utm_medium"] } : {}),
          ...(b.utm?.["utm_campaign"] ? { utm_campaign: b.utm["utm_campaign"] } : {}),
        };

        let leadId: string | null = null;
        let isNew = false;
        if (b.lead_id) {
          const { data: cur } = await db
            .from("leads")
            .select("id, utm_campaign")
            .eq("id", b.lead_id)
            .maybeSingle();
          if (cur) {
            // Não troca a campanha que já estava salva (first-touch do lead).
            await db
              .from("leads")
              .update({ ...base, ...(cur.utm_campaign ? {} : utm) })
              .eq("id", cur.id);
            leadId = cur.id;
          }
        }
        if (!leadId) {
          const { data, error } = await db
            .from("leads")
            .insert({ ...base, ...utm })
            .select("id")
            .single();
          if (error) return Response.json({ error: "Não foi possível salvar." }, { status: 500 });
          leadId = data.id;
          isNew = true;
        }
        if (b.session_id)
          await db.from("sessions").update({ lead_id: leadId }).eq("id", b.session_id);
        // Só registra "lead identificado" uma vez por lead (a 2ª chamada só completa o e-mail).
        if (isNew || !b.email)
          await db.from("events").insert({
            type: "lead_identified",
            lead_id: leadId,
            session_id: b.session_id ?? null,
            page: "/checkout",
            data: { ...(b.utm ?? {}), name: b.name },
          });
        return Response.json({ lead_id: leadId });
      },
    },
  },
});
