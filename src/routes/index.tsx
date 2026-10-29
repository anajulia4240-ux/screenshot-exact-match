import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PRODUCTS } from "@/lib/catalog";
import { addToCart } from "@/lib/cart";
import { brl } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "byhappy — Revendedora Happy Hair | Kits com desconto" },
      { name: "description", content: "Happy Hair, Happy Collagen, Happy Sleep, Happy Calm e Creatina originais com preço de loja oficial. Revendedora autorizada, pagamento via PIX." },
      { property: "og:title", content: "byhappy — Revendedora Happy Hair" },
      { property: "og:description", content: "Kits Happy Hair originais com desconto e frete grátis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <section className="mx-auto max-w-6xl px-4 py-10 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Cabelos, unhas e pele mais saudáveis</h1>
        <p className="mt-2 text-muted-foreground">Kits Happy Hair originais com até 80% de desconto.</p>
      </section>
      <main className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 md:grid-cols-3 lg:grid-cols-4">
        {PRODUCTS.map((p) => {
          const off = p.compareAt > p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0;
          return (
            <article key={p.slug} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              <div className="relative aspect-square bg-muted">
                <img src={p.image} alt={p.name} loading="lazy" width={400} height={400} className="h-full w-full object-cover" />
                {off > 0 && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">-{off}%</span>}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <h2 className="line-clamp-3 text-sm font-medium">{p.name}</h2>
                <div className="mt-auto">
                  {off > 0 && <p className="text-xs text-muted-foreground line-through">{brl(p.compareAt)}</p>}
                  <p className="text-lg font-bold text-primary">{brl(p.price)}</p>
                </div>
                <Button size="sm" onClick={() => { addToCart(p.slug); toast.success("Adicionado ao carrinho."); }}>Comprar</Button>
              </div>
            </article>
          );
        })}
      </main>
      <StoreFooter />
    </div>
  );
}
