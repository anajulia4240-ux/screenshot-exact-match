import { createFileRoute } from "@tanstack/react-router";

/**
 * Recuperação de vendas por e-mail (checkout abandonado + PIX não pago).
 * Chamado pelo agendamento a cada 1 minuto com o segredo LOVABLE_CRON_SECRET
 * (header "Authorization: Bearer <segredo>" ou "x-cron-secret").
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret") ?? "";
  if (!secret || auth !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { runRecovery } = await import("@/lib/recovery.server");
  const r = await runRecovery();
  return Response.json(r);
}

export const Route = createFileRoute("/api/public/recovery-run")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
