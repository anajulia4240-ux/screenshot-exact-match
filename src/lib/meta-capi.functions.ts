import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Reenvio manual do Purchase para a CAPI. Só envia para pedido PAGO e ainda sem meta_sent,
 * então não dá para forjar compra. O envio normal acontece sozinho em markOrderPaid.
 */
export const sendPurchaseCapi = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const pay = await import("@/lib/payments.server");
    return pay.sendMetaForOrder(data.order_id);
  });
