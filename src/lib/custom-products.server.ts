// Produtos criados na aba "Adicionar produto" do painel (somente servidor).
// Ficam em app_settings "custom_products" — mesma tabela da aba Preços, sem tabela nova.
import { applyCustomProducts, type CustomProduct } from "@/lib/catalog";

export const CUSTOM_PRODUCTS_KEY = "custom_products";
export const PRODUCT_IMAGES_BUCKET = "product-images";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .slice(0, maxItems)
        .map((x) => x.slice(0, maxLen))
    : [];
const cents = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Aceita só registros bem formados (o JSON do banco nunca é confiado às cegas). */
export function sanitizeCustomProducts(raw: unknown): CustomProduct[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomProduct[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = str(o.id, 64);
    const slug = str(o.slug, 120);
    const name = str(o.name, 160);
    if (!id || !slug || !name) continue;
    out.push({
      id,
      slug,
      name,
      description: str(o.description, 2000),
      price: cents(o.price),
      compareAt: cents(o.compareAt),
      days: Math.max(0, Math.min(3650, Math.round(Number(o.days) || 0))),
      images: strList(o.images, 5, 2048),
      features: strList(o.features, 20, 200),
      sizes: strList(o.sizes, 20, 8),
      variants: Array.isArray(o.variants)
        ? o.variants
            .filter(
              (v): v is { label: string; image: string } =>
                !!v &&
                typeof v === "object" &&
                typeof (v as { label?: unknown }).label === "string",
            )
            .slice(0, 3)
            .map((v) => ({
              label: v.label.slice(0, 40),
              image: typeof v.image === "string" ? v.image.slice(0, 2048) : "",
            }))
        : [],
      active: o.active !== false,
      createdAt: str(o.createdAt, 40) || new Date(0).toISOString(),
      updatedAt: str(o.updatedAt, 40) || new Date(0).toISOString(),
    });
  }
  return out;
}

/** Lê todos (ativos e pausados) e já aplica os ativos no catálogo deste servidor. */
export async function loadCustomProducts(): Promise<CustomProduct[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", CUSTOM_PRODUCTS_KEY)
      .maybeSingle();
    const list = sanitizeCustomProducts(data?.value);
    applyCustomProducts(list);
    return list;
  } catch (e) {
    console.error("[custom-products] falha ao carregar", e);
    return [];
  }
}
