import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

export function StoreHeader() {
  const cart = useCart();
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="bg-primary py-2 text-center text-xs font-medium text-primary-foreground">
        Frete grátis para todo o Brasil • Pagamento via PIX
      </div>
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold tracking-tight text-primary">byhappy</Link>
          <Link to="/checkout" className="relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium hover:bg-accent" aria-label="Abrir carrinho">
            <ShoppingBag className="h-4 w-4" /> Carrinho
            {count > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{count}</span>}
          </Link>
        </div>
      </header>
    </>
  );
}

export function StoreFooter() {
  return (
    <footer className="mt-16 border-t bg-card py-8 text-center text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">byhappy — Revendedora autorizada Happy Hair</p>
      <p className="mt-1">Produtos originais. Happy Hair é marca de seu respectivo titular.</p>
    </footer>
  );
}
