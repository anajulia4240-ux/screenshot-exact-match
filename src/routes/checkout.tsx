import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getSessionId, getTracking, track } from "@/lib/track";
import {
  Check,
  ChevronDown,
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
  Truck,
  Tag,
  Headphones,
  KeyRound,
  QrCode,
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
    <ol className="mb-6 flex items-center gap-2 text-xs font-semibold sm:text-sm">
      {labels.map((l, i) => (
        <li key={l} className={`flex min-w-0 items-center gap-2 ${i > 0 ? "flex-1" : ""}`}>
          {i > 0 && <span className={`h-0.5 min-w-4 flex-1 rounded-full ${i <= step ? "bg-success" : "bg-border"}`} />}
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
          >
            {i < step ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={`hidden sm:inline ${i === step ? "text-primary" : "text-muted-foreground"}`}>{l}</span>
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
  const [copied, setCopied] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
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
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não consegui copiar. Selecione o código e copie manualmente.");
    }
  }

  // ---------- Telas ----------
  const body = (() => {
    if (paid && pix) {
      return (
        <div className="mx-auto max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-9 w-9 text-success" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Pagamento confirmado!</h1>
          <p className="mt-2 text-muted-foreground">
            Obrigada, {customer.name.split(" ")[0]}! Recebemos {brl(pix.total_cents)}. Você vai
            receber as atualizações do pedido no WhatsApp.
          </p>
          <Button asChild size="lg" className="mt-6 h-12 w-full rounded-2xl font-semibold">
            <Link to="/">Voltar à loja</Link>
          </Button>
        </div>
      );
    }
    if (pix) {
      return (
        <div className="mx-auto max-w-md space-y-4">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <QrCode className="h-6 w-6" />
            </span>
            <h1 className="mt-3 text-2xl font-bold">Seu PIX está pronto!</h1>
            <p className="mt-1 text-sm text-muted-foreground">Valor a pagar</p>
            <p className="text-4xl font-bold text-primary">{brl(pix.total_cents)}</p>
          </div>
          <div className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm">
            {pix.qr_image && (
              <img src={pix.qr_image} alt="QR Code PIX" width={240} height={240} className="mx-auto h-60 w-60 rounded-2xl border bg-card p-3" />
            )}
            <div className="rounded-2xl bg-muted p-3 text-left font-mono text-xs break-all text-muted-foreground">{pix.pix_code}</div>
            <Button className="h-14 w-full rounded-2xl text-base font-semibold uppercase tracking-wide shadow-lg" size="lg" onClick={() => void copyPix()}>
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              {copied ? "Código copiado!" : "Copiar código PIX"}
            </Button>
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-warning/15 p-3 text-sm font-semibold">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando confirmação do pagamento…
            </div>
          </div>
          <ol className="space-y-3 rounded-3xl border bg-card p-5 text-sm">
            {[
              `Abra o app do seu banco e escolha PIX Copia e Cola${pix.qr_image ? " ou leia o QR Code" : ""}.`,
              "Cole o código e confirme o pagamento.",
              "Pronto! Esta tela atualiza sozinha quando o pagamento for confirmado.",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <span className="text-muted-foreground">{t}</span>
              </li>
            ))}
          </ol>
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
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
              <div className="space-y-2 pt-2">
                <p className="text-sm font-semibold">Forma de entrega</p>
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-primary bg-card p-4 shadow-sm">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Truck className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Frete grátis</span>
                    <span className="block text-xs text-muted-foreground">7 a 12 dias úteis</span>
                  </span>
                  <span className="text-right">
                    <b className="block text-sm text-success">Grátis</b>
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                  <input type="radio" checked readOnly className="sr-only" aria-label="Frete grátis" />
                </label>
              </div>
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
              <p className="text-xl font-bold">Pagamento</p>
              <div className="divide-y rounded-2xl border bg-card text-sm">
                <div className="flex items-start gap-3 p-4">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="flex-1">
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-muted-foreground">{maskPhone(customer.phone)}</p>
                  </div>
                  <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => goto(0)}>Alterar</button>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="flex-1 text-muted-foreground">
                    <p className="font-semibold text-foreground">Entrega • Frete grátis</p>
                    <p>{address.street}, {address.number}{address.complement ? ` - ${address.complement}` : ""}</p>
                    <p>{address.city}/{address.state} • {maskCep(address.cep)}</p>
                  </div>
                  <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => goto(1)}>Alterar</button>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 rounded-2xl border bg-card p-1.5 pl-4 focus-within:border-primary">
                  <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    placeholder="Cupom de desconto"
                    aria-label="Cupom"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <Button type="button" variant="secondary" className="rounded-xl font-semibold" onClick={() => void applyCoupon()}>
                    Aplicar
                  </Button>
                </div>
                {coupon && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" /> Cupom {coupon.code} aplicado: -{coupon.percent}% ({brl(discount)})
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-primary/5 p-4">
                <span className="text-sm font-semibold">Total a pagar</span>
                <span className="text-2xl font-bold text-primary">{brl(total)}</span>
              </div>
              <Button
                size="lg"
                className="h-14 w-full rounded-2xl text-base font-semibold uppercase tracking-wide shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                disabled={busy}
                onClick={() => void generatePix()}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                {busy ? "Gerando seu PIX…" : `Gerar PIX — ${brl(total)}`}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => goto(1)}>
                Voltar
              </Button>
            </div>
          )}
        </div>
        <aside className="h-fit space-y-3 rounded-3xl border bg-card p-5 shadow-sm md:sticky md:top-24">
          <button type="button" onClick={() => setSummaryOpen((v) => !v)} className="flex w-full items-center justify-between md:pointer-events-none">
            <span className="text-lg font-bold">Resumo do seu pedido</span>
            <span className="flex items-center gap-1 text-sm font-bold text-primary md:hidden">{brl(total)} <ChevronDown className={`h-4 w-4 transition-transform ${summaryOpen ? "rotate-180" : ""}`} /></span>
          </button>
          <div className={`${summaryOpen ? "block" : "hidden"} space-y-3 md:block`}>
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
              <span className="text-success">Grátis</span>
            </p>
            {discount > 0 && (
              <p className="flex justify-between text-success">
                <span>Cupom {coupon?.code}</span>
                <span>-{brl(discount)}</span>
              </p>
            )}
            <p className="flex items-end justify-between border-t pt-3">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary">{brl(total)}</span>
            </p>
          </div>
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
        <TrustBar />
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

function TrustBar() {
  const items = [
    { Icon: Lock, label: "Pagamento protegido" },
    { Icon: ShieldCheck, label: "Ambiente seguro" },
    { Icon: KeyRound, label: "Dados protegidos" },
    { Icon: Headphones, label: "Atendimento ao cliente" },
  ];
  return (
    <ul className="mt-10 grid grid-cols-2 gap-3 border-t pt-6 md:grid-cols-4">
      {items.map(({ Icon, label }) => (
        <li key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} /> {label}
        </li>
      ))}
    </ul>
  );
}
