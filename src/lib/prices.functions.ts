// Server fns da aba Preços: leitura pública e gravação só para administradores.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizePriceMap, type PriceMap } from "@/lib/catalog";

export const getPublicPrices = createServerFn({ method: "GET" }).handler(
  async (): Promise<PriceMap> => {
    const { loadPriceMap } = await import("./prices.server");
    return loadPriceMap();
  },
);

const saveSchema = z.object({
  prices: z.record(
    z.string().max(200),
    z.object({
      price: z.number().int().min(100).max(10_000_000),
      compareAt: z.number().int().min(0).max(10_000_000),
    }),
  ),
});

export const savePrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; prices: PriceMap }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PRICES_KEY } = await import("./prices.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem alterar preços.");
    const clean = sanitizePriceMap(data.prices);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: PRICES_KEY, value: clean, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) {
      console.error("[prices] falha ao salvar", error);
      throw new Error("Não foi possível salvar os preços.");
    }
    return { ok: true, prices: clean };
  });
