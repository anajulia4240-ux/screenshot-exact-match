import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { findProduct } from "@/lib/catalog";
import { clearCart, setQty, useCart } from "@/lib/cart";
import { brl } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Carrinho e pagamento — byhappy" },
      { name: "description", content: "Finalize seu pedido Happy Hair com pagamento via PIX." },
      { property: "og:title", content: "Carrinho — byhappy" },
      { property: "og:description", content: "Finalize seu pedido com PIX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const cart = useCart();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const lines = Object.entries(cart).flatMap(([slug, qty]) => { const p = findProduct(slug); return p ? [{ p, qty }] : []; });
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items: lines.map((l) => ({ slug: l.p.slug, qty: l.qty })) }),
      });
      const json = (await res.json()) as { total_cents?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar pedido.");
      setDone(json.total_cents ?? total);
      clearCart();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar pedido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {done !== null ? (
          <div className="rounded-xl border bg-card p-6 text-center">
            <h1 className="text-2xl font-bold">Pedido recebido!</h1>
            <p className="mt-2 text-muted-foreground">Total: <b className="text-foreground">{brl(done)}</b>. Vamos te chamar no WhatsApp com a chave PIX.</p>
            <Button asChild className="mt-4"><Link to="/">Voltar à loja</Link></Button>
          </div>
        ) : lines.length === 0 ? (
          <div className="text-center"><p className="text-muted-foreground">Seu carrinho está vazio.</p><Button asChild className="mt-4"><Link to="/">Ver produtos</Link></Button></div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <ul className="space-y-3">
              {lines.map(({ p, qty }) => (
                <li key={p.slug} className="flex gap-3 rounded-xl border bg-card p-3">
                  <img src={p.image} alt={p.name} width={64} height={64} className="h-16 w-16 rounded-md object-cover" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{p.name}</p>
                    <p className="font-bold text-primary">{brl(p.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Diminuir" onClick={() => setQty(p.slug, qty - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-6 text-center text-sm">{qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Aumentar" onClick={() => setQty(p.slug, qty + 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                </li>
              ))}
            </ul>
            <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-lg font-bold">Total: {brl(total)}</p>
              <Input required placeholder="Nome completo" aria-label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input required placeholder="WhatsApp" aria-label="WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input type="email" placeholder="E-mail (opcional)" aria-label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Finalizar com PIX</Button>
            </form>
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
