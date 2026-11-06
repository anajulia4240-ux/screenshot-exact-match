/**
 * Caminhos que NÃO são da loja (painel, login, API). Todo o resto é loja: lá o Pixel,
 * a Utmify e os eventos funcionam — inclusive nas páginas de venda /nome-do-produto.
 * Ao criar uma aba nova no painel, adicione o caminho dela aqui.
 */
export const ADMIN_PATHS = [
  "/auth",
  "/reset-password",
  "/dashboard",
  "/events",
  "/orders",
  "/tracking",
  "/campaigns",
  "/god",
  "/visitors",
  "/security",
  "/logs",
  "/coupons",
  "/prices",
  "/products",
  "/settings",
  "/api",
] as const;

/** Endereços que um produto do painel não pode usar como link da página de venda. */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  ...ADMIN_PATHS.map((p) => p.slice(1)),
  "checkout",
  "rastreio",
  "carrinho",
  "assets",
  "kits",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

/** Link da página: só letras minúsculas, números e hífen (ex.: "biotina", "kit-3-potes"). */
export const PAGE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

/** Transforma um texto qualquer em link válido ("Biotina 60 Cáps" → "biotina-60-caps"). */
export function toPageSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
