// Server fns da aba Pedidos: ações sensíveis rodam no servidor e só para administradores.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ id: z.string().uuid() });

/**
 * Confirma o pagamento manualmente (ex.: cliente mandou comprovante).
 * Usa o mesmo fluxo do gateway: marca pago, registra evento e avisa Utmify + Meta.
 */
export const confirmOrderManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; already: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem confirmar pedidos.");
    const { markOrderPaid } = await import("./payments.server");
    const changed = await markOrderPaid(data.id, "manual");
    return { ok: true, already: !changed };
  });
