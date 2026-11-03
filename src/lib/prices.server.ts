// Leitura dos preços salvos no painel (somente servidor).
import { sanitizePriceMap, type PriceMap } from "@/lib/catalog";

export const PRICES_KEY = "product_prices";

export async function loadPriceMap(): Promise<PriceMap> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", PRICES_KEY)
      .maybeSingle();
    return sanitizePriceMap(data?.value);
  } catch (e) {
    console.error("[prices] falha ao carregar preços do painel", e);
    return {};
  }
}
