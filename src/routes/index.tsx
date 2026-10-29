import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AVULSOS, KITS, type Product } from "@/lib/catalog";
import { addToCart } from "@/lib/cart";
import { brl } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";
import { SocialProof } from "@/components/store/social-proof";
import bannerAsset from "@/assets/banner-byhappy.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "byhappy — Kits Happy Hair com desconto | Revendedora" },
      { name: "description", content: "Kits Happy Hair originais com brindes e até 80% de desconto. Revendedora autorizada, pagamento via PIX." },
      { property: "og:title", content: "byhappy — Kits Happy Hair" },
      { property: "og:description", content: "Kits Happy Hair originais com desconto e brindes grátis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StorePage,
});

function ProductCard({ p }: { p: Product }) {
  const off = p.compareAt > p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-square bg-muted">
        <img src={p.image} alt={p.name} loading="lazy" width={400} height={400} className="h-full w-full object-cover" />
        {off > 0 && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">-{off}%</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-3 text-sm font-medium">{p.name}</h3>
        <div className="mt-auto">
          {off > 0 && <p className="text-xs text-muted-foreground line-through">{brl(p.compareAt)}</p>}
          <p className="text-lg font-bold text-primary">{brl(p.price)}</p>
        </div>
        <Button size="sm" onClick={() => { addToCart(p.slug); toast.success("Adicionado ao carrinho."); }}>Comprar</Button>
      </div>
    </article>
  );
}

function StorePage() {
  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <section className="mx-auto max-w-6xl px-4 py-10 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Kits Happy Hair com brindes grátis</h1>
        <p className="mt-2 text-muted-foreground">Quanto maior o kit, maior o desconto — até 80% off.</p>
      </section>
      <main className="mx-auto max-w-6xl px-4 pb-10">
        <h2 className="mb-4 text-xl font-bold">Kits em destaque</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {KITS.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
        <h2 className="mb-4 mt-10 text-xl font-bold">Produtos avulsos</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {AVULSOS.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </main>
      <StoreFooter />
    </div>
  );
}
