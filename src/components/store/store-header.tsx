import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Facebook, Instagram, ShoppingBag, Youtube } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";

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

const FOOTER_COLUMNS: { title: string; items: string[] }[] = [
  { title: "Link úteis", items: ["Programa de Embaixadores", "Perguntas Frequentes", "Resultados Reais", "Desafio 90 Dias"] },
  { title: "Navegação", items: ["Minha conta", "Tratamentos", "Rastreamento"] },
  { title: "Política", items: ["Políticas de Privacidade", "Política de Reembolso", "Troca e devoluções", "Frete e entrega", "Termos de Serviço", "Aviso Legal"] },
];

export function StoreFooter() {
  const [email, setEmail] = useState("");
  return (
    <footer className="mt-16 border-t bg-card text-sm text-muted-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <form
          className="mx-auto flex max-w-xl items-center gap-2 rounded-full border bg-background p-1.5 pl-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) toast.success("E-mail cadastrado! Você vai receber nossas ofertas.");
            setEmail("");
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Insira o e-mail aqui"
            aria-label="Insira o e-mail aqui"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" className="rounded-full px-8 lowercase">enviar</Button>
        </form>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 pb-10 md:grid-cols-4">
        <div>
          <h3 className="mb-3 font-bold text-foreground">Contato</h3>
          <p>E-mail: contato@byhappy.com.br</p>
          <p>Horário de atendimento: Segunda a sexta das 08:00 às 18:00</p>
          <p className="mt-2">Revendedora autorizada Happy Hair.</p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 font-bold text-foreground">{col.title}</h3>
            <ul className="space-y-2">
              {col.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="mb-3 font-bold text-foreground">Redes Sociais</h3>
          <div className="flex gap-2">
            {[Facebook, Instagram, Youtube].map((Icon, i) => (
              <span key={i} className="flex h-10 w-10 items-center justify-center rounded-full border border-primary bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-5">
          {["Compra 100% segura", "Site protegido SSL", "PIX confirmado na hora"].map((seal) => (
            <span key={seal} className="rounded border px-3 py-2 text-[11px] font-medium text-foreground">{seal}</span>
          ))}
          <p className="ml-auto text-xs">© 2026, byhappy — Revendedora autorizada Happy Hair</p>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-6">
          {["PIX", "VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "BOLETO"].map((brand) => (
            <span key={brand} className="rounded bg-muted px-2.5 py-1 text-[10px] font-bold tracking-wide text-foreground">{brand}</span>
          ))}
        </div>
        <p className="px-4 pb-4 text-center text-xs">Produtos originais. Happy Hair é marca de seu respectivo titular.</p>
      </div>
    </footer>
  );
}
