import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/br";

const Body = z.union([
  z.object({ cpf: z.string().trim().min(11).max(20) }),
  z.object({ code: z.string().trim().min(6).max(60) }),
]);

interface Row {
  id: string; status: string; created_at: string; paid_at: string | null;
  customer_name: string | null; items: unknown; tracking: unknown;
}

/** Rastreio público: devolve só status, datas, transportadora e primeiro nome (sem dados pessoais). */
export const Route = createFileRoute("/api/public/rastreio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Informe o CPF ou o código." }, { status: 400 });
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const cols = "id, status, created_at, paid_at, customer_name, items, tracking";
        let rows: Row[] = [];
        if ("cpf" in parsed.data) {
          const cpf = onlyDigits(parsed.data.cpf);
          if (!isValidCpf(cpf)) return Response.json({ error: "CPF inválido." }, { status: 400 });
          const { data, error } = await db.from("orders").select(cols).eq("tracking->customer->>cpf", cpf).order("created_at", { ascending: false }).limit(10);
          if (error) return Response.json({ error: "Erro ao buscar." }, { status: 500 });
          rows = data as Row[];
        } else {
          const code = parsed.data.code.toUpperCase().replace(/^#/, "");
          const { data, error } = await db.from("orders").select(cols).eq("tracking->>tracking_code", code).limit(5);
          if (error) return Response.json({ error: "Erro ao buscar." }, { status: 500 });
          rows = data as Row[];
          if (!rows.length && /^[0-9A-F]{8}$/.test(code)) {
            const { data: d2 } = await db.from("orders").select(cols).order("created_at", { ascending: false }).limit(500);
            rows = ((d2 ?? []) as Row[]).filter((r) => r.id.slice(0, 8).toUpperCase() === code);
          }
        }
        const orders = rows.map((r) => {
          const t = (r.tracking ?? {}) as Record<string, unknown>;
          const ship = (t["shipping"] ?? {}) as Record<string, unknown>;
          const items = Array.isArray(r.items) ? (r.items as { name?: string; qty?: number }[]) : [];
          return {
            code: r.id.slice(0, 8).toUpperCase(),
            status: r.status,
            created_at: r.created_at,
            paid_at: r.paid_at,
            first_name: (r.customer_name ?? "").split(" ")[0] ?? "",
            carrier: typeof ship["method"] === "string" ? ship["method"] : "sedex",
            tracking_code: typeof t["tracking_code"] === "string" ? t["tracking_code"] : null,
            items: items.map((i) => `${i.qty ?? 1}x ${i.name ?? "Produto"}`),
          };
        });
        return Response.json({ orders });
      },
    },
  },
});
