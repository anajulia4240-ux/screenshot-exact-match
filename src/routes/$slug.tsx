// Página de venda de um produto criado na aba "Adicionar produto" do painel.
// Endereço: planetamundo.shop/<link-do-produto> (ex.: /biotina). Feita para anúncio:
// a pessoa cai direto no produto e vai para o checkout com um toque.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Lock, Minus, Plus, ShieldCheck, ShoppingCart, Truck, Zap } from "lucide-react";
import type { CustomProduct } from "@/lib/catalog";
import { getPublicCustomProducts } from "@/lib/products-admin.functions";
import { setQty, clearCart } from "@/lib/cart";
import { fbqTrack } from "@/lib/fbq";
import { track } from "@/lib/track";
import { brl } from "@/lib/store";
import { SHIPPING } from "@/lib/shipping";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";
import { PromoBar } from "@/components/store/promo-bar";
import { WhatsAppButton } from "@/components/store/whatsapp-button";

const SITE = "https://planetamundo.shop";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }): Promise<CustomProduct> => {
    const list = await getPublicCustomProducts().catch((): CustomProduct[] => []);
    const p = list.find((x) => x.slug === params.slug.toLowerCase());
    if (!p) throw notFound();
    return p;
  },
  staleTime: 60_000,
  head: ({ loaderData: p }) => {
    if (!p) return {};
    const desc = (p.description || `${p.name} com frete grátis e pagamento via PIX.`).slice(0, 160);
    const img = p.images[0] ?? "";
    return {
      meta: [
        { title: `${p.name} | byhappy` },
        { name: "description", content: desc },
        { property: "og:title", content: p.name },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `${SITE}/${p.slug}` },
        ...(img
          ? [
              { property: "og:image", content: img },
              { name: "twitter:image", content: img },
            ]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductSalesPage,
});

const FREE = SHIPPING.find((s) => s.price_cents === 0);

function ProductSalesPage() {
  const p = Route.useLoaderData();
  const [active, setActive] = useState(0);
  const [qty, setQtyState] = useState(1);
  const [going, setGoing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const off = p.compareAt > p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0;
  const total = p.price * qty;

  // ViewContent no Pixel + evento no painel (uma vez por produto aberto).
  useEffect(() => {
    void track("product_view", { slug: p.slug, value_cents: p.price });
    fbqTrack("ViewContent", {
      content_ids: [p.slug],
      content_name: p.name,
      content_type: "product",
      value: p.price / 100,
      currency: "BRL",
    });
  }, [p.slug, p.name, p.price]);

  const goTo = (i: number) => {
    setActive(i);
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  /** Compra direta: o carrinho fica só com este produto e abre o checkout (mantendo as UTMs). */
  function buy() {
    if (going) return;
    setGoing(true);
    clearCart();
    setQty(p.slug, qty);
    void track("add_to_cart", { slug: p.slug, source: "pagina_produto" });
    fbqTrack("AddToCart", {
      content_ids: [p.slug],
      content_name: p.name,
      content_type: "product",
      value: total / 100,
      currency: "BRL",
      quantity: qty,
    });
    window.location.assign(`/checkout${window.location.search}`);
  }

  return (
    <div className="store-theme min-h-screen pb-28">
      <StoreHeader />
      <PromoBar />

      <main className="mx-auto max-w-5xl px-4 pt-4 md:grid md:grid-cols-2 md:gap-8 md:pt-8">
        {/* Fotos (arrasta para o lado no celular) */}
        <section aria-label="Fotos do produto">
          <div className="relative overflow-hidden rounded-2xl border bg-muted">
            <div
              ref={scroller}
              className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(e) => {
                const el = e.currentTarget;
                const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                if (i !== active) setActive(i);
              }}
            >
              {p.images.map((src, i) => (
                <img
                  key={src + i}
                  src={src}
                  alt={i === 0 ? p.name : `${p.name} — foto ${i + 1}`}
                  width={600}
                  height={600}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="aspect-square w-full shrink-0 snap-center bg-white object-contain max-md:h-[44vh]"
                />
              ))}
            </div>
            {off > 0 && (
              <span className="absolute left-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-xs font-extrabold text-white shadow">
                -{off}%
              </span>
            )}
          </div>
          {p.images.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {p.images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  aria-label={`Ver foto ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? "border-primary" : "border-transparent opacity-70"}`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Informações e compra */}
        <section className="mt-5 md:mt-0">
          <h1 className=" text-xl font-extrabold leading-tight sm:text-2xl">{p.name}</h1>

          <div className="mt-3 space-y-0.5">
            {off > 0 && (
              <p className="text-sm text-muted-foreground line-through">de {brl(p.compareAt)}</p>
            )}
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-3xl font-extrabold text-primary">{brl(p.price)}</span>
              <span className="text-sm font-semibold text-success">no PIX</span>
            </p>
            {off > 0 && (
              <p className="text-sm font-bold text-success">
                Você economiza {brl(p.compareAt - p.price)}
              </p>
            )}
          </div>

          <ul className="mt-4 space-y-2 rounded-xl border bg-card p-3 text-sm">
            <li className="flex items-center gap-2">
              <Truck className="h-4 w-4 shrink-0 text-primary" />
              <span>
                <b>{FREE ? "Frete grátis" : "Entrega"}</b> para todo o Brasil
                {FREE ? ` (${FREE.minDays} a ${FREE.maxDays} dias úteis)` : ""}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Pagamento via <b>PIX</b> com aprovação na hora
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <span>Código de rastreio enviado por e-mail</span>
            </li>
          </ul>

          {/* Quantidade */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm font-medium">Quantidade</span>
            <div className="flex items-center rounded-xl border">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={() => setQtyState((q) => Math.max(1, q - 1))}
                className="flex h-11 w-11 items-center justify-center"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={() => setQtyState((q) => Math.min(10, q + 1))}
                className="flex h-11 w-11 items-center justify-center"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={buy}
            disabled={going}
            className="mt-4 hidden h-14 w-full items-center justify-center gap-2 rounded-xl bg-success text-base font-extrabold uppercase tracking-wide text-success-foreground shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:opacity-70 md:flex"
          >
            <ShoppingCart className="h-5 w-5" /> Comprar agora — {brl(total)}
          </button>
          <p className="mt-2 hidden items-center justify-center gap-1 text-xs text-muted-foreground md:flex">
            <Lock className="h-3.5 w-3.5" /> Compra segura
          </p>

          {p.features.length > 0 && (
            <ul className="mt-6 space-y-2">
              {p.features.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}

          {p.description && (
            <div className="mt-6">
              <h2 className="mb-2 text-base font-bold">Sobre o produto</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {p.description}
              </p>
            </div>
          )}
        </section>
      </main>

      <StoreFooter />
      {/* No celular, sobe o WhatsApp para não ficar em cima do botão de compra. */}
      <div className="[&>a]:max-md:bottom-24">
        <WhatsAppButton />
      </div>

      {/* Botão fixo no rodapé (celular) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={buy}
          disabled={going}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success text-base font-extrabold uppercase tracking-wide text-success-foreground shadow-md active:scale-[0.98] disabled:opacity-70"
        >
          <ShoppingCart className="h-5 w-5" /> Comprar agora — {brl(total)}
        </button>
      </div>
    </div>
  );
}
