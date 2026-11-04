import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Polling do checkout: consulta o status na Fruitfy pelo servidor e dá baixa quando pago.
 * Quando pago, devolve também o código de rastreio da loja (BHY…), gerado na hora.
 */
export const Route = createFileRoute("/api/public/pix-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!z.string().uuid().safeParse(id).success)
          return Response.json({ error: "invalid" }, { status: 400 });
        const pay = await import("@/lib/payments.server");
        const { ensureOrderCode } = await import("@/lib/order-code.server");
        const paidResponse = async () =>
          Response.json({ status: "paid", order_code: await ensureOrderCode(id).catch(() => null) });

        const order = await pay.loadOrder(id);
        if (!order) return Response.json({ error: "not_found" }, { status: 404 });
        if (order.status === "paid") return paidResponse();
        if (order.status !== "pending") return Response.json({ status: order.status });

        const tracking = (order.tracking ?? {}) as { payment?: { transaction_id?: string } };
        const tx = tracking.payment?.transaction_id;
        if (!tx) return Response.json({ status: "pending" });
        const remote = await pay.getFruitfyOrder(tx);
        if (pay.isPaidStatus(remote.status, remote.paid_at)) {
          await pay.markOrderPaid(order.id, "gateway");
          return paidResponse();
        }
        return Response.json({
          status:
            remote.status === "canceled" ||
            remote.status === "failed" ||
            remote.status === "refused"
              ? "cancelled"
              : "pending",
        });
      },
    },
  },
});
