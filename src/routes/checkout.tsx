import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getSessionId, getTracking, track } from "@/lib/track";
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { findProduct } from "@/lib/catalog";
import { clearCart, setQty, useCart } from "@/lib/cart";
import { brl } from "@/lib/store";
import { isValidCpf, isValidPhone, maskCep, maskCpf, maskPhone, onlyDigits } from "@/lib/br";
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

const CUSTOMER_KEY = "byhappy_customer";
const LEAD_KEY = "byhappy_lead";

interface Customer {
  name: string;
  phone: string;
  email: string;
  cpf: string;
}
interface Address {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}
interface Pix {
  order_id: string;
  total_cents: number;
  pix_code: string;
  qr_image: string | null;
}

const EMPTY_CUSTOMER: Customer = { name: "", phone: "", email: "", cpf: "" };
const EMPTY_ADDRESS: Address = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

function loadSaved(): { customer: Customer; address: Address } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null") as {
      customer?: Customer;
      address?: Address;
    } | null;
    return v?.customer?.name
      ? {
          customer: { ...EMPTY_CUSTOMER, ...v.customer },
          address: { ...EMPTY_ADDRESS, ...(v.address ?? {}) },
        }
      : null;
  } catch {
    return null;
  }
}
function save(customer: Customer, address: Address) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ customer, address }));
  } catch {
    /* ignorado */
  }
}

function Steps({ step }: { step: number }) {
  const labels = ["Identificação", "Entrega", "Pagamento"];
  return (
    <ol className="mb-6 flex items-center justify-between gap-2 text-xs font-bold sm:text-sm">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
          >
            {i < step ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={i === step ? "text-primary" : "text-muted-foreground"}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

function CheckoutPage() {
  const cart = useCart();
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [saved, setSaved] = useState<{ customer: Customer; address: Address } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [pix, setPix] = useState<Pix | null>(null);
  const [paid, setPaid] = useState(false);
  const generating = useRef(false);

  const lines = Object.entries(cart).flatMap(([slug, qty]) => {
    const p = findProduct(slug);
    return p ? [{ p, qty }] : [];
  });
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const discount = coupon ? Math.round((subtotal * coupon.percent) / 100) : 0;
  const total = subtotal - discount;

  useEffect(() => {
    void track("checkout_opened", { value_cents: subtotal });
    setSaved(loadSaved());
  }, []);

  const goto = (n: number) => {
    setStep(n);
    void track("checkout_step", { step: n + 1 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function applySaved() {
    if (!saved) return;
    setCustomer(saved.customer);
    setAddress(saved.address);
    setSaved(null);
  }

  // ---------- Etapa 1: identificação ----------
  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (customer.name.trim().split(/\s+/).length < 2)
      return void toast.error("Informe nome e sobrenome.");
    if (!isValidPhone(customer.phone))
      return void toast.error("WhatsApp inválido. Use DDD + número.");
    if (!/^\S+@\S+\.\S+$/.test(customer.email)) return void toast.error("E-mail inválido.");
    if (!isValidCpf(customer.cpf)) return void toast.error("CPF inválido.");
    setBusy(true);
    try {
      let leadId: string | null = null;
      try {
        leadId = localStorage.getItem(LEAD_KEY);
      } catch {
        /* ignorado */
      }
      const res = await fetch("/api/public/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          session_id: getSessionId(),
          name: customer.name.trim(),
          phone: onlyDigits(customer.phone),
          email: customer.email.trim(),
          utm: pickUtm(getTracking()),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { lead_id?: string };
      if (j.lead_id)
        try {
          localStorage.setItem(LEAD_KEY, j.lead_id);
        } catch {
          /* ignorado */
        }
    } catch {
      /* lead é best-effort: não trava a compra */
    }
    save(customer, address);
    setBusy(false);
    goto(1);
  }

  // ---------- Etapa 2: entrega ----------
  async function lookupCep(raw: string) {
    const cep = onlyDigits(raw);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await r.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (j.erro) toast.error("CEP não encontrado.");
      else
        setAddress((a) => ({
          ...a,
          street: j.logradouro || a.street,
          neighborhood: j.bairro || a.neighborhood,
          city: j.localidade || a.city,
          state: j.uf || a.state,
        }));
    } catch {
      toast.error("Não consegui buscar o CEP. Preencha o endereço.");
    } finally {
      setCepLoading(false);
    }
  }

  function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    if (onlyDigits(address.cep).length !== 8) return void toast.error("CEP inválido.");
    if (!address.street || !address.number || !address.city || address.state.length !== 2)
      return void toast.error("Preencha o endereço completo.");
    save(customer, address);
    goto(2);
  }

  // ---------- Etapa 3: pagamento ----------
  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    const r = await fetch(
      `/api/public/coupon?code=${encodeURIComponent(code)}&subtotal=${subtotal}`,
    );
    const j = (await r.json().catch(() => ({}))) as {
      valid?: boolean;
      code?: string;
      percent?: number;
    };
    if (j.valid && j.code && j.percent) {
      setCoupon({ code: j.code, percent: j.percent });
      toast.success(`Cupom ${j.code} aplicado: -${j.percent}%`);
    } else {
      setCoupon(null);
      toast.error("Cupom inválido ou expirado.");
    }
  }

  async function generatePix() {
    if (generating.current) return; // bloqueia duplo clique
    generating.current = true;
    setBusy(true);
    try {
      let leadId: string | null = null;
      try {
        leadId = localStorage.getItem(LEAD_KEY);
      } catch {
        /* ignorado */
      }
      const res = await fetch("/api/public/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          session_id: getSessionId(),
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: onlyDigits(customer.phone),
            cpf: onlyDigits(customer.cpf),
          },
          address: {
            ...address,
            cep: onlyDigits(address.cep),
            complement: address.complement || undefined,
            neighborhood: address.neighborhood || undefined,
          },
          coupon: coupon?.code,
          items: lines.map((l) => ({ slug: l.p.slug, qty: l.qty })),
          tracking: getTracking(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<Pix> & { error?: string };
      if (!res.ok || !j.pix_code || !j.order_id)
        throw new Error(j.error ?? "Não foi possível gerar o PIX.");
      setPix({
        order_id: j.order_id,
        total_cents: j.total_cents ?? total,
        pix_code: j.pix_code,
        qr_image: j.qr_image ?? null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o PIX.");
      generating.current = false;
    } finally {
      setBusy(false);
    }
  }

  // Polling do status a cada 5s (pelo nosso servidor, nunca direto na Fruitfy).
  useEffect(() => {
    if (!pix || paid) return;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/public/pix-status?id=${pix.order_id}`);
        const j = (await r.json()) as { status?: string };
        if (j.status === "paid") {
          setPaid(true);
          clearCart();
        }
      } catch {
        /* tenta de novo */
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [pix, paid]);

  async function copyPix() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.pix_code);
      toast.success("Código PIX copiado!");
    } catch {
      toast.error("Não consegui copiar. Selecione o código e copie manualmente.");
    }
  }

  // ---------- Telas ----------
  const body = (() => {
    if (paid && pix) {
      return (
        <div className="rounded-xl border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
          <h1 className="mt-3 text-2xl font-bold">Pagamento confirmado!</h1>
          <p className="mt-2 text-muted-foreground">
            Obrigada, {customer.name.split(" ")[0]}! Recebemos {brl(pix.total_cents)}. Você vai
            receber as atualizações do pedido no WhatsApp.
          </p>
          <Button asChild className="mt-4">
            <Link to="/">Voltar à loja</Link>
          </Button>
        </div>
      );
    }
    if (pix) {
      return (
        <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-5 text-center">
          <h1 className="text-xl font-bold">Pague com PIX para finalizar</h1>
          <p className="text-3xl font-bold text-primary">{brl(pix.total_cents)}</p>
          {pix.qr_image && (
            <img
              src={pix.qr_image}
              alt="QR Code PIX"
              width={220}
              height={220}
              className="mx-auto h-56 w-56 rounded-md border bg-white p-2"
            />
          )}
          <div className="rounded-md border bg-muted p-2 text-left font-mono text-xs break-all">
            {pix.pix_code}
          </div>
          <Button className="w-full" size="lg" onClick={copyPix}>
            <Copy className="h-4 w-4" />
            Copiar código PIX
          </Button>
          <ol className="space-y-1 text-left text-sm text-muted-foreground">
            <li>
              1. Abra o app do seu banco e escolha <b>PIX Copia e Cola</b>
              {pix.qr_image ? " ou leia o QR Code" : ""}.
            </li>
            <li>2. Cole o código e confirme o pagamento.</li>
            <li>3. Pronto! Esta tela atualiza sozinha quando o pagamento cair.</li>
          </ol>
          <p className="flex items-center justify-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aguardando pagamento…
          </p>
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            Compra segura • Produto original com garantia
          </p>
        </div>
      );
    }
    if (lines.length === 0) {
      return (
        <div className="text-center">
          <p className="text-muted-foreground">Seu carrinho está vazio.</p>
          <Button asChild className="mt-4">
            <Link to="/">Ver produtos</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div>
          <Steps step={step} />
          {saved && step === 0 && (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
              <span>
                Usar os dados salvos de <b>{saved.customer.name.split(" ")[0]}</b>?
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={applySaved}>
                  Usar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSaved(null)}>
                  Não
                </Button>
              </div>
            </div>
          )}
          {step === 0 && (
            <form onSubmit={submitIdentity} className="space-y-4 rounded-3xl border-2 border-primary/20 bg-card p-5 shadow-sm">
              <p className="flex items-center gap-2 text-xl font-extrabold text-primary">
                <User className="h-4 w-4" />
                Seus dados
              </p>
              <Input
                required
                autoComplete="name"
                placeholder="Nome completo"
                aria-label="Nome completo"
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              />
              <Input
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="WhatsApp com DDD"
                aria-label="WhatsApp"
                value={maskPhone(customer.phone)}
                onChange={(e) => setCustomer({ ...customer, phone: onlyDigits(e.target.value) })}
              />
              <Input
                required
                type="email"
                autoComplete="email"
                placeholder="E-mail"
                aria-label="E-mail"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
              <Input
                required
                inputMode="numeric"
                placeholder="CPF"
                aria-label="CPF"
                value={maskCpf(customer.cpf)}
                onChange={(e) => setCustomer({ ...customer, cpf: onlyDigits(e.target.value) })}
              />
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}Continuar para entrega
              </Button>
            </form>
          )}
          {step === 1 && (
            <form onSubmit={submitAddress} className="space-y-4 rounded-3xl border-2 border-primary/20 bg-card p-5 shadow-sm">
              <p className="flex items-center gap-2 text-xl font-extrabold text-primary">
                <MapPin className="h-4 w-4" />
                Endereço de entrega
              </p>
              <div className="relative">
                <Input
                  required
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="CEP"
                  aria-label="CEP"
                  value={maskCep(address.cep)}
                  onChange={(e) => {
                    const v = onlyDigits(e.target.value);
                    setAddress({ ...address, cep: v });
                    if (v.length === 8) void lookupCep(v);
                  }}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <Input
                required
                placeholder="Rua"
                aria-label="Rua"
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
              />
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <Input
                  required
                  placeholder="Número"
                  aria-label="Número"
                  value={address.number}
                  onChange={(e) => setAddress({ ...address, number: e.target.value })}
                />
                <Input
                  placeholder="Complemento (opcional)"
                  aria-label="Complemento"
                  value={address.complement}
                  onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                />
              </div>
              <Input
                placeholder="Bairro"
                aria-label="Bairro"
                value={address.neighborhood}
                onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
              />
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <Input
                  required
                  placeholder="Cidade"
                  aria-label="Cidade"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
                <Input
                  required
                  maxLength={2}
                  placeholder="UF"
                  aria-label="UF"
                  value={address.state}
                  onChange={(e) =>
                    setAddress({
                      ...address,
                      state: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    })
                  }
                />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 p-3 text-sm">
                <span className="flex items-center gap-2">
                  <input type="radio" checked readOnly aria-label="Frete grátis" />
                  Frete grátis • 7 a 12 dias úteis
                </span>
                <b className="text-green-600">Grátis</b>
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => goto(0)}>
                  Voltar
                </Button>
                <Button type="submit" size="lg" className="flex-1">
                  Continuar para pagamento
                </Button>
              </div>
            </form>
          )}
          {step === 2 && (
            <div className="space-y-4 rounded-3xl border-2 border-primary/20 bg-card p-5 shadow-sm">
              <p className="font-bold">Revise e pague com PIX</p>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p>
                  <b>{customer.name}</b> • {maskPhone(customer.phone)}
                </p>
                <p className="text-muted-foreground">
                  {address.street}, {address.number}
                  {address.complement ? ` - ${address.complement}` : ""} • {address.city}/
                  {address.state} • {maskCep(address.cep)}
                </p>
                <button
                  type="button"
                  className="mt-1 text-xs text-primary underline"
                  onClick={() => goto(1)}
                >
                  Alterar
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Cupom de desconto"
                  aria-label="Cupom"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                />
                <Button type="button" variant="outline" onClick={() => void applyCoupon()}>
                  Aplicar
                </Button>
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => void generatePix()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Gerar PIX — {brl(total)}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => goto(1)}>
                Voltar
              </Button>
            </div>
          )}
        </div>
        <aside className="h-fit space-y-3 rounded-xl border bg-card p-4">
          <p className="font-bold">Resumo do pedido</p>
          <ul className="space-y-3">
            {lines.map(({ p, qty }) => (
              <li key={p.slug} className="flex gap-3">
                <img
                  src={p.image}
                  alt={p.name}
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-md object-cover"
                />
                <div className="flex-1 text-xs">
                  <p className="font-medium leading-tight">{p.name}</p>
                  <p className="font-bold text-primary">{brl(p.price)}</p>
                  {step < 2 && (
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-6 w-6"
                        aria-label="Diminuir"
                        onClick={() => setQty(p.slug, qty - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center">{qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-6 w-6"
                        aria-label="Aumentar"
                        onClick={() => setQty(p.slug, qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
                        aria-label={`Remover ${p.name}`}
                        onClick={() => setQty(p.slug, 0)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {step === 2 && <p className="text-muted-foreground">Qtd: {qty}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t pt-3 text-sm">
            <p className="flex justify-between">
              <span>Subtotal</span>
              <span>{brl(subtotal)}</span>
            </p>
            <p className="flex justify-between">
              <span>Frete</span>
              <span className="text-green-600">Grátis</span>
            </p>
            {discount > 0 && (
              <p className="flex justify-between text-green-600">
                <span>Cupom {coupon?.code}</span>
                <span>-{brl(discount)}</span>
              </p>
            )}
            <p className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{brl(total)}</span>
            </p>
          </div>
        </aside>
      </div>
    );
  })();

  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        {!pix && (
          <>
            <Link to="/" className="text-sm font-semibold text-primary hover:underline">← Continuar comprando</Link>
            <h1 className="mb-6 mt-2 text-3xl font-extrabold text-primary md:text-4xl">Finalizar compra 💖</h1>
          </>
        )}
        {body}
      </main>
      <StoreFooter />
    </div>
  );
}

function pickUtm(t: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "src",
    "sck",
  ]) {
    const v = t[k];
    if (v) out[k] = v;
  }
  return out;
}
