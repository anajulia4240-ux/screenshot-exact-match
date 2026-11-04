import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Minus, Plus, Ticket, Trash2, Truck, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { findProduct } from "@/lib/catalog";
import { setCartOpen, setQty, useCart, useCartOpen } from "@/lib/cart";
import { brl } from "@/lib/store";
import { readWelcomeCoupon } from "@/lib/identification";

/** Gaveta lateral do carrinho no estilo da referência (abre pelo botão Carrinho ou ao comprar). */
export function CartDrawer() {
  const open = useCartOpen();
  const cart = useCart();
  const [showFrete, setShowFrete] = useState(false);
  const lines = Object.entries(cart).flatMap(([slug, qty]) => {
    const p = findProduct(slug);
    return p ? [{ p, qty }] : [];
  });
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const compare = lines.reduce((s, l) => s + Math.max(l.p.compareAt, l.p.price) * l.qty, 0);
  const saving = compare - subtotal;
  const [welcomeCoupon, setWelcomeCoupon] = useState<{ code: string; percent: number } | null>(null);
  useEffect(() => {
    const saved = readWelcomeCoupon();
    if (!open || !saved || subtotal <= 0) return;
    let active = true;
    void fetch(`/api/public/coupon?code=${encodeURIComponent(saved.code)}&subtotal=${subtotal}`)
      .then((response) => response.json())
      .then((result: { valid?: boolean; code?: string; percent?: number }) => {
        if (active) setWelcomeCoupon(result.valid && result.code && result.percent ? { code: result.code, percent: result.percent } : null);
      }).catch(() => { if (active) setWelcomeCoupon(null); });
    return () => { active = false; };
  }, [open, subtotal]);
  const welcomeDiscount = welcomeCoupon ? Math.round(subtotal * welcomeCoupon.percent / 100) : 0;

  return (
    <Sheet open={open} onOpenChange={setCartOpen}>
      <SheetContent side="right" className="store-theme flex w-full flex-col gap-0 p-0 sm:max-w-md [&>button]:hidden">
        <div className="px-5 pt-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-2xl font-extrabold text-primary">Carrinho de compras</SheetTitle>
            <button onClick={() => setCartOpen(false)} aria-label="Fechar carrinho" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
              <X className="h-6 w-6" />
            </button>
          </div>
          <p className="mt-3 text-sm font-medium text-primary">✓ Você ganhou Frete Grátis!</p>
          <div className="mt-2 h-2 rounded-full bg-primary" />
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Seu carrinho está vazio.</p>
          ) : (
            <ul>
              {lines.map(({ p, qty }) => (
                <li key={p.slug} className="flex gap-3 border-b py-4">
                  <img src={p.image} alt={p.name} width={80} height={80} className="h-20 w-20 rounded-md object-cover" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">{p.name}</p>
                      <div className="shrink-0 text-right">
                        {p.compareAt > p.price && <p className="text-xs text-muted-foreground line-through">{brl(p.compareAt * qty)}</p>}
                        <p className="font-bold text-primary">{brl(p.price * qty)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button aria-label={`Remover ${p.name}`} onClick={() => setQty(p.slug, 0)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button aria-label="Diminuir" onClick={() => setQty(p.slug, qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 text-primary">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-4 text-center font-semibold">{qty}</span>
                      <button aria-label="Aumentar" onClick={() => setQty(p.slug, qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 text-primary">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <>
              <button onClick={() => setShowFrete((v) => !v)} className="flex w-full items-center justify-between border-b py-4 text-sm">
                <span className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> Frete</span>
                <span className="flex items-center gap-1 text-primary">Grátis <ChevronDown className="h-4 w-4" /></span>
              </button>
              {showFrete && <p className="border-b py-3 text-sm text-muted-foreground">Frete grátis para todo o Brasil.</p>}
              <div className="flex items-center justify-between border-b py-4 text-sm">
                <span className="flex items-center gap-2 font-semibold"><Ticket className="h-4 w-4" /> Cupom</span>
                <span className="text-primary">{welcomeCoupon ? `${welcomeCoupon.code} · ${welcomeCoupon.percent}% OFF` : "Aplique no pagamento"}</span>
              </div>
            </>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2 border-t px-5 pb-6 pt-4">
            <p className="flex justify-between text-sm"><span className="font-semibold uppercase text-muted-foreground">Subtotal</span><span>{brl(compare)}</span></p>
            {saving > 0 && (
              <p className="flex justify-between text-sm text-success"><span className="font-semibold uppercase">Desconto</span><span>- {brl(saving)}</span></p>
            )}
            {welcomeDiscount > 0 && <p className="flex justify-between text-sm text-success"><span>Cupom {welcomeCoupon?.code}</span><span>- {brl(welcomeDiscount)}</span></p>}
            <p className="flex items-end justify-between pt-2"><span className="font-bold uppercase">Total</span><span className="text-2xl font-extrabold">{brl(subtotal - welcomeDiscount)}</span></p>
            <Link
              to="/checkout"
              onClick={() => setCartOpen(false)}
              className="mt-3 flex h-14 w-full items-center justify-center rounded-full bg-primary text-lg font-extrabold uppercase tracking-wide text-primary-foreground shadow-lg hover:opacity-90"
            >
              Finalizar compra
            </Link>
            <button onClick={() => setCartOpen(false)} className="w-full py-2 text-muted-foreground hover:text-foreground">Continuar comprando</button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
