import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { track } from "@/lib/track";
import { toast } from "sonner";
import { PackageSearch, Facebook, Instagram, Menu, ShoppingBag, Youtube } from "lucide-react";
import { setCartOpen, useCart } from "@/lib/cart";
import { CartDrawer } from "@/components/store/cart-drawer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Menu da loja: links na linha do logo (computador) e gaveta ☰ (celular). */
const NAV_LINKS: { label: string; to: "/" | "/rastreio"; hash?: string; desktop?: boolean }[] = [
  { label: "Início", to: "/" },
  { label: "Kits promocionais", to: "/", hash: "kits", desktop: true },
  { label: "Tratamentos", to: "/", hash: "tratamentos", desktop: true },
  { label: "Resultados reais", to: "/", hash: "resultados", desktop: true },
  { label: "Dúvidas", to: "/", hash: "faq", desktop: true },
  { label: "Rastrear pedido", to: "/rastreio" },
];

export function StoreHeader() {
  const cart = useCart();
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const clicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 });
  useEffect(() => { void track("page_view"); }, []);
  // 3 cliques rápidos no nome abrem o login do painel (que pede a senha).
  const onLogo = (e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    clicks.current = now - clicks.current.t < 600 ? { n: clicks.current.n + 1, t: now } : { n: 1, t: now };
    if (clicks.current.n >= 3) { clicks.current = { n: 0, t: 0 }; void navigate({ to: "/auth" }); }
    else if (window.location.pathname !== "/") window.setTimeout(() => { if (clicks.current.n === 1) void navigate({ to: "/" }); }, 650);
  };
  return (
    <>
      <div className="bg-primary py-2 text-center text-xs font-medium text-primary-foreground">
        Frete grátis para todo o Brasil • Pagamento via PIX
      </div>
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-1">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button type="button" aria-label="Abrir menu" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent lg:hidden">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="store-theme w-72 p-0">
                <SheetHeader className="border-b px-5 py-4">
                  <SheetTitle className="text-left text-2xl font-bold tracking-tight text-primary">byhappy</SheetTitle>
                </SheetHeader>
                <nav aria-label="Menu" className="flex flex-col p-2">
                  {NAV_LINKS.map((l) => (
                    <Link key={l.label} to={l.to} hash={l.hash} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-[15px] font-semibold text-foreground hover:bg-accent">
                      {l.label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <Link to="/" onClick={onLogo} className="select-none text-xl font-bold tracking-tight text-primary sm:text-2xl">byhappy</Link>
          </div>
          <nav aria-label="Menu da loja" className="hidden items-center gap-6 text-sm font-semibold text-foreground/80 lg:flex">
            {NAV_LINKS.filter((l) => l.desktop).map((l) => (
              <Link key={l.label} to={l.to} hash={l.hash} className="transition-colors hover:text-primary">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
          <Link to="/rastreio" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium hover:bg-accent sm:gap-2 sm:px-4 sm:text-sm">
            <PackageSearch className="h-4 w-4" /> <span className="hidden sm:inline">Rastrear pedido</span><span className="sm:hidden">Rastrear</span>
          </Link>
          <button type="button" onClick={() => setCartOpen(true)} className="relative inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium hover:bg-accent sm:gap-2 sm:px-4 sm:text-sm" aria-label="Abrir carrinho">
            <ShoppingBag className="h-4 w-4" /> <span className="hidden sm:inline">Carrinho</span>
            {count > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{count}</span>}
          </button>
          </div>
        </div>
      </header>
      <CartDrawer />
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
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 pb-10 md:grid-cols-5">
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
