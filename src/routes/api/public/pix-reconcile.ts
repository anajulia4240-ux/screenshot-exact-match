import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Conferência automática (rede de segurança do webhook), a cada 2 minutos:
 * consulta na Fruitfy até 30 PIX pendentes das últimas 24h e confirma os pagos
 * pelo mesmo fluxo do webhook (atômico, Meta + Utmify uma única vez).
 */
export const Route = createFileRoute("/api/public/pix-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const pay = await import("@/lib/payments.server");
        const pending = await pay.listPendingOrders(30);
        let confirmed = 0;
        // Em lotes de 10 para terminar rápido sem sobrecarregar a Fruitfy.
        for (let i = 0; i < pending.length; i += 10) {
          const batch = pending.slice(i, i + 10);
          const results = await Promise.all(
            batch.map((o) =>
              pay.confirmOrderFromGateway(o, "reconcile").catch((e: unknown) => {
                console.error("[reconcile] erro", o.id, e);
                return { changed: false };
              }),
            ),
          );
          confirmed += results.filter((r) => r.changed).length;
        }
        return Response.json({ checked: pending.length, confirmed });
      },
    },
  },
});
