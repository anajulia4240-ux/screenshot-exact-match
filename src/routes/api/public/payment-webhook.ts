import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Fruitfy (cadastre esta URL em Integrações > Webhooks).
 * A doc não descreve assinatura, então o payload NÃO é confiado: o status é
 * reconsultado na API da Fruitfy com o nosso token antes de dar baixa.
 * Valor usado é sempre o salvo no pedido. Idempotente.
 */
export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          event?: string;
          order?: { id?: string; uuid?: string };
        } | null;
        const tx = body?.order?.id ?? body?.order?.uuid;
        if (!tx || typeof tx !== "string" || tx.length > 100)
          return Response.json({ ok: false }, { status: 400 });

        const pay = await import("@/lib/payments.server");
        const order = await pay.findOrderByTransaction(tx);
        if (!order) return Response.json({ ok: true, ignored: "order_not_found" });
        if (order.status === "paid") return Response.json({ ok: true, already: true });

        const remote = await pay.getFruitfyOrder(tx);
        if (pay.isPaidStatus(remote.status, remote.paid_at)) {
          await pay.markOrderPaid(order.id, "gateway");
          return Response.json({ ok: true, paid: true });
        }
        return Response.json({ ok: true, status: remote.status });
      },
    },
  },
});
