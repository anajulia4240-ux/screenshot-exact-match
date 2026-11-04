import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getSessionId, getTracking, track } from "@/lib/track";
import { fbqIdentify, fbqTrack, getTestEventCode, purchaseOnce } from "@/lib/fbq";
import {
  ArrowLeft,
  ArrowRight,
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
  Zap,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { findProduct } from "@/lib/catalog";
import { IDENTIFICATION_COUPON } from "@/lib/coupon-defaults";
import { clearCart, setQty, useCart } from "@/lib/cart";
import { brl } from "@/lib/store";
import { isValidCpf, isValidPhone, maskCep, maskCpf, maskPhone, onlyDigits } from "@/lib/br";
import { Button } from "@/components/ui/button";
import { DEFAULT_SHIPPING, SHIPPING, arrivalLabel, shippingById, type ShippingId } from "@/lib/shipping";
import correiosLogo from "@/assets/correios-logo.png.asset.json";
import jadlogLogo from "@/assets/jadlog-logo.png.asset.json";
import { Input } from "@/components/ui/input";

/**
 * Copia texto para a área de transferência.
 * Usa a API moderna e, se ela falhar (permissão negada, navegador antigo),
 * cai para um textarea oculto + execCommand. Retorna true quando copiou de verdade.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* segue para o plano B */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

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

/** Nome com sobrenome + WhatsApp válido: identificação completa. */
function identified(c: { name: string; phone: string }): boolean {
  return c.name.trim().split(/\s+/).length >= 2 && isValidPhone(c.phone);
}

/** Estilo padrão dos campos do checkout. */
const FIELD = "h-11 rounded-xl bg-background text-[15px] shadow-none focus-visible:ring-primary/30";

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

/** Bloco de etapa no estilo "sanfona": aberto quando ativo, resumo quando concluído. */
function Section({
  n,
  title,
  subtitle,
  icon: Icon,
  active,
  done,
  onEdit,
  summary,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  icon: typeof User;
  active: boolean;
  done: boolean;
  onEdit?: () => void;
  summary?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={`etapa-${n}`}
      className={`scroll-mt-3 overflow-hidden rounded-2xl border bg-card transition-shadow ${
        active ? "border-primary/40 shadow-lg shadow-primary/5 ring-1 ring-primary/10" : "shadow-sm"
      }`}
    >
      <div className={`flex items-center gap-3 px-4 sm:px-6 ${done ? "py-3" : "py-4"}`}>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done
              ? "bg-success text-success-foreground"
              : active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className={`flex items-center gap-2 text-base font-bold sm:text-lg ${
              !active && !done ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {title}
            {active && <Icon className="h-4 w-4 text-primary" />}
          </h2>
          {active && subtitle && <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
          {!active && !done && <p className="text-xs text-muted-foreground">Preencha a etapa anterior</p>}
        </div>
        {done && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
          >
            Editar
          </button>
        )}
      </div>
      {done && summary && (
        <div className="-mt-2 space-y-0.5 px-4 pb-3 pl-[3.75rem] text-xs text-muted-foreground sm:px-6 sm:pl-[4.25rem] sm:text-[13px]">
          {summary}
        </div>
      )}
      {active && <div className="border-t bg-card px-4 py-5 sm:px-6 sm:py-6">{children}</div>}
    </section>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-foreground/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
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
  const [couponOpen, setCouponOpen] = useState(false);
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [pix, setPix] = useState<Pix | null>(null);
  const [paid, setPaid] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingId>(DEFAULT_SHIPPING);
  const shipOpt = shippingById(shipping);
  const generating = useRef(false);
  /** Guarda o "copiou o PIX" uma só vez quando a pessoa copia mais de uma vez seguidas. */
  const lastCopiedRef = useRef(0);
  const contentIds = useRef<string[]>([]);

  const lines = Object.entries(cart).flatMap(([slug, qty]) => {
    const p = findProduct(slug);
    return p ? [{ p, qty }] : [];
  });
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const discount = coupon ? Math.round((subtotal * coupon.percent) / 100) : 0;
  const shippingCents = shipOpt.price_cents;
  const total = subtotal - discount + shippingCents;
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const compareTotal = lines.reduce((s, l) => s + Math.max(l.p.compareAt, l.p.price) * l.qty, 0);
  const savings = compareTotal - total;

  useEffect(() => {
    void track("checkout_opened", { value_cents: subtotal });
    fbqTrack("InitiateCheckout", {
      value: subtotal / 100,
      currency: "BRL",
      num_items: lines.reduce((n, l) => n + l.qty, 0),
      content_ids: lines.map((l) => l.p.slug),
      content_type: "product",
    });
    // Link do e-mail de recuperação: /checkout?kit=slug:qtd,slug:qtd remonta o carrinho.
    try {
      const kit = new URLSearchParams(window.location.search).get("kit");
      if (kit) {
        for (const part of kit.split(",").slice(0, 5)) {
          const [slug = "", q = "1"] = part.split(":");
          const qty = Math.min(Math.max(parseInt(q, 10) || 1, 1), 10);
          if (findProduct(slug)) setQty(slug, qty);
        }
      }
    } catch {
      /* ignorado */
    }
    const s = loadSaved();
    // Veio do pop-up de identificação (só nome + WhatsApp): já preenche direto.
    if (s && !s.customer.email) {
      // Veio do pop-up: nome e WhatsApp já preenchidos, ela só completa o e-mail.
      setCustomer(s.customer);
      setPrefilled(identified(s.customer));
    } else setSaved(s);
  }, []);

  const goto = (n: number) => {
    setStep(n);
    void track("checkout_step", { step: n + 1 });
    // Leva o cliente direto para a etapa atual (as anteriores ficam resumidas acima).
    window.setTimeout(() => {
      const el = n > 0 ? document.getElementById(`etapa-${n + 1}`) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }, 60);
  };

  function applySaved() {
    if (!saved) return;
    setCustomer(saved.customer);
    setAddress(saved.address);
    setSaved(null);
  }

  // ---------- Lead (nome + WhatsApp na etapa 1; e-mail completa no pagamento) ----------
  async function saveLead(withEmail: boolean) {
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
        ...(withEmail && customer.email.trim() ? { email: customer.email.trim() } : {}),
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
  }

  // ---------- Etapa 1: identificação (só nome + WhatsApp) ----------
  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (customer.name.trim().split(/\s+/).length < 2)
      return void toast.error("Informe nome e sobrenome.");
    if (!isValidPhone(customer.phone))
      return void toast.error("WhatsApp inválido. Use DDD + número.");
    if (!/^\S+@\S+\.\S+$/.test(customer.email.trim())) return void toast.error("E-mail inválido.");
    setBusy(true);
    try {
      await saveLead(true);
    } catch {
      /* lead é best-effort: não trava a compra */
    }
    save(customer, address);
    fbqIdentify(customer);
    setBusy(false);
    if (!coupon)
      toast.success(`Presente liberado: 10% OFF com o cupom ${IDENTIFICATION_COUPON.code}!`, {
        description: "Toque no cupom na etapa de pagamento para aplicar.",
      });
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
    fbqIdentify({ ...customer, cep: address.cep, city: address.city, state: address.state });
    goto(2);
  }

  // ---------- Etapa 3: pagamento ----------
  async function applyCoupon(selected?: string) {
    const code = (selected ?? couponInput).trim().toUpperCase();
    if (!code) return;
    if (selected) setCouponInput(code);
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
      void track("coupon_applied", { code: j.code, percent: j.percent });
      toast.success(`Cupom ${j.code} aplicado: -${j.percent}%`);
    } else {
      setCoupon(null);
      toast.error("Cupom inválido ou expirado.");
    }
  }

  async function generatePix() {
    if (generating.current) return; // bloqueia duplo clique
    if (!/^\S+@\S+\.\S+$/.test(customer.email.trim())) {
      goto(0);
      return void toast.error("Informe um e-mail válido para receber a confirmação.");
    }
    if (!isValidCpf(customer.cpf)) {
      document.getElementById("pix-cpf")?.focus();
      return void toast.error("CPF inválido. Ele é obrigatório para gerar o PIX.");
    }
    save(customer, address);
    fbqIdentify(customer);
    generating.current = true;
    setBusy(true);
    contentIds.current = lines.map((l) => l.p.slug);
    fbqTrack("AddPaymentInfo", { value: total / 100, currency: "BRL", content_ids: contentIds.current, content_type: "product" });
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
          shipping,
          items: lines.map((l) => ({ slug: l.p.slug, qty: l.qty })),
          tracking: {
            ...getTracking(),
            event_source_url: window.location.href.split("?")[0] ?? "",
            ...(getTestEventCode() ? { test_event_code: getTestEventCode() ?? "" } : {}),
          },
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o PIX.");
      generating.current = false;
    } finally {
      setBusy(false);
    }
  }

  // Polling do status a cada 5s (pelo nosso servidor, nunca direto na Fruitfy).
  // Depois de pago, continua consultando só até receber o código de rastreio.
  useEffect(() => {
    if (!pix || (paid && orderCode)) return;
    let tries = 0;
    const t = window.setInterval(async () => {
      if (paid && ++tries > 24) return window.clearInterval(t);
      try {
        const r = await fetch(`/api/public/pix-status?id=${pix.order_id}`);
        const j = (await r.json()) as { status?: string; order_code?: string | null };
        if (j.order_code) setOrderCode(j.order_code);
        if (j.status === "paid" && !paid) {
          purchaseOnce(pix.order_id, () =>
            fbqTrack(
              "Purchase",
              { value: pix.total_cents / 100, currency: "BRL", content_ids: contentIds.current, content_type: "product", order_id: pix.order_id },
              { eventID: pix.order_id },
            ),
          );
          setPaid(true);
          clearCart();
        }
      } catch {
        /* tenta de novo */
      }
    }, paid ? 2500 : 5000);
    return () => window.clearInterval(t);
  }, [pix, paid, orderCode]);

  /** Grava que a pessoa copiou o código PIX (botão, Ctrl+C ou toque longo no código). */
  function markPixCopied() {
    if (!pix) return;
    const now = Date.now();
    if (now - lastCopiedRef.current < 5000) return;
    lastCopiedRef.current = now;
    void track("pix_copied", { order_id: pix.order_id, order: pix.order_id.slice(0, 8).toUpperCase() });
  }

  async function copyPix() {
    if (!pix) return;
    if (!(await copyText(pix.pix_code))) {
      toast.error("Não consegui copiar. Selecione o código e copie manualmente.");
      return;
    }
    markPixCopied();
    toast.success("Código PIX copiado!");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  // ---------- Resumo do pedido (lateral no desktop, recolhível no topo no mobile) ----------
  const summaryCard = (
    <aside className="order-first h-fit overflow-hidden rounded-2xl border bg-card shadow-sm md:order-last md:sticky md:top-6">
      <button
        type="button"
        onClick={() => setSummaryOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left md:pointer-events-none md:px-5 md:pt-5 md:pb-2"
        aria-expanded={summaryOpen}
      >
        <span className="flex items-center gap-2 text-sm font-bold md:text-base">
          <span className="md:hidden">{summaryOpen ? "Ocultar resumo" : "Ver resumo"}</span>
          <span className="hidden md:inline">Resumo do pedido</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            {itemCount} {itemCount === 1 ? "item" : "itens"}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform md:hidden ${summaryOpen ? "rotate-180" : ""}`} />
        </span>
        <span className="text-base font-extrabold text-primary md:hidden">{brl(total)}</span>
      </button>

      <div className={`${summaryOpen ? "block" : "hidden"} border-t md:block md:border-t-0`}>
        <ul className="divide-y px-4 md:px-5">
          {lines.map(({ p, qty }) => (
            <li key={p.slug} className="flex gap-3 py-3">
              <div className="relative shrink-0">
                <img
                  src={p.image}
                  alt={p.name}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-xl border bg-white object-cover"
                />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/80 px-1 text-[10px] font-bold text-background">
                  {qty}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{p.name}</p>
                <p className="mt-0.5 flex items-baseline gap-1.5">
                  {p.compareAt > p.price && (
                    <span className="text-[11px] text-muted-foreground line-through">{brl(p.compareAt)}</span>
                  )}
                  <span className="text-sm font-bold text-primary">{brl(p.price)}</span>
                </p>
                {step < 2 ? (
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="flex items-center rounded-lg border">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Diminuir"
                        onClick={() => setQty(p.slug, qty - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{qty}</span>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Aumentar"
                        onClick={() => setQty(p.slug, qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remover ${p.name}`}
                      onClick={() => setQty(p.slug, 0)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">Qtd: {qty}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t bg-muted/30 px-4 py-4 text-sm md:px-5">
          <p className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{brl(subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">Frete{shippingCents ? ` (${shipOpt.name})` : ""}</span>
            {shippingCents ? (
              <span className="font-medium">{brl(shippingCents)}</span>
            ) : (
              <span className="font-semibold text-success">Grátis</span>
            )}
          </p>
          {discount > 0 && (
            <p className="flex justify-between text-success">
              <span>Cupom {coupon?.code}</span>
              <span className="font-semibold">-{brl(discount)}</span>
            </p>
          )}
          <div className="flex items-end justify-between border-t pt-3">
            <span className="font-semibold">Total</span>
            <span className="text-right">
              <span className="block text-2xl font-extrabold leading-none text-primary">{brl(total)}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">à vista no PIX</span>
            </span>
          </div>
          {savings > 0 && (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success">
              <Tag className="h-3.5 w-3.5" /> Você está economizando {brl(savings)}
            </p>
          )}
        </div>

        <ul className="hidden space-y-2 border-t px-5 py-4 text-xs text-muted-foreground md:block">
          <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" strokeWidth={1.75} /> Opção de frete grátis para todo o Brasil</li>
          <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.75} /> Pagamento seguro via PIX</li>
          <li className="flex items-center gap-2"><Headphones className="h-4 w-4 text-primary" strokeWidth={1.75} /> Atendimento pelo WhatsApp</li>
        </ul>
      </div>
    </aside>
  );

  // ---------- Telas ----------
  const body = (() => {
    if (paid && pix) {
      return (
        <div className="mx-auto max-w-md space-y-4">
          <div className="overflow-hidden rounded-3xl border bg-card text-center shadow-lg">
            <div className="bg-success/10 px-6 pb-5 pt-7">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg shadow-success/30">
                <CheckCircle2 className="h-9 w-9" />
              </span>
              <h1 className="mt-4 text-2xl font-extrabold">Pagamento confirmado!</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Obrigada, {customer.name.split(" ")[0]}! Recebemos {brl(pix.total_cents)}.
              </p>
            </div>

            <div className="space-y-3 p-5">
              {orderCode ? (
                <>
                  <p className="text-sm font-semibold">🎉 Acabamos de gerar seu código de rastreio:</p>
                  <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 font-mono text-xl font-extrabold tracking-wider text-primary">
                    {orderCode}
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl font-semibold"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(orderCode);
                        setCodeCopied(true);
                        window.setTimeout(() => setCodeCopied(false), 2000);
                      } catch {
                        toast.error("Não consegui copiar. Anote o código.");
                      }
                    }}
                  >
                    {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {codeCopied ? "Código copiado!" : "Copiar código"}
                  </Button>
                  <Button asChild size="lg" className="h-12 w-full rounded-xl text-base font-bold">
                    <Link to="/rastreio" search={{ code: orderCode }}>
                      <Truck className="h-5 w-5" /> Rastrear meu pedido
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="flex items-center justify-center gap-2 rounded-2xl bg-muted/60 p-4 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando seu código de rastreio…
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Pedido <span className="font-mono font-semibold text-foreground">#{pix.order_id.slice(0, 8).toUpperCase()}</span>
                {" • "}você também pode rastrear pelo CPF
              </p>
            </div>
          </div>

          <ol className="space-y-3 rounded-3xl border bg-card p-5 text-sm shadow-sm">
            <li className="font-bold">Próximos passos</li>
            {[
              { done: true, title: "Pagamento aprovado", text: "Seu pedido foi confirmado." },
              { done: true, title: "Código de rastreio gerado", text: "Acompanhe tudo pela página Rastrear pedido." },
              { done: false, title: "Envio imediato", text: "Seu pedido entra agora na fila de postagem. Avisamos pelo WhatsApp." },
              { done: false, title: shippingCents ? `Entrega via ${shipOpt.name}` : "Entrega com frete grátis", text: arrivalLabel(shipOpt) },
            ].map((s) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    s.done ? "bg-success text-success-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Truck className="h-3.5 w-3.5" />}
                </span>
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.text}</span>
                </span>
              </li>
            ))}
            <li className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-xs font-semibold text-success">
              <ShieldCheck className="h-4 w-4 shrink-0" /> Garantia de 30 dias: se não gostar, devolvemos seu dinheiro.
            </li>
          </ol>

          <Button asChild variant="ghost" className="w-full text-muted-foreground">
            <Link to="/">Voltar à loja</Link>
          </Button>
        </div>
      );
    }
    if (pix) {
      return (
        <div className="mx-auto max-w-md space-y-4">
          <div className="overflow-hidden rounded-3xl border bg-card shadow-lg">
            <div className="bg-primary/5 px-5 py-5 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <QrCode className="h-6 w-6" />
              </span>
              <h1 className="mt-3 text-xl font-bold sm:text-2xl">Seu PIX está pronto!</h1>
              <p className="mt-1 text-sm text-muted-foreground">Valor a pagar</p>
              <p className="text-4xl font-extrabold text-primary">{brl(pix.total_cents)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pedido <span className="font-mono font-semibold text-foreground">#{pix.order_id.slice(0, 8).toUpperCase()}</span>
              </p>
            </div>
            <div className="space-y-4 p-5">
              {pix.qr_image && (
                <img src={pix.qr_image} alt="QR Code PIX" width={240} height={240} className="mx-auto h-56 w-56 rounded-2xl border bg-white p-3 sm:h-60 sm:w-60" />
              )}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">PIX Copia e Cola</p>
                <div
                  onCopy={() => markPixCopied()}
                  className="max-h-24 overflow-y-auto rounded-xl border bg-muted/50 p-3 text-left font-mono text-[11px] break-all text-muted-foreground"
                >{pix.pix_code}</div>
              </div>
              <Button className="h-14 w-full rounded-2xl text-base font-bold uppercase tracking-wide shadow-lg" size="lg" onClick={() => void copyPix()}>
                {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                {copied ? "Código copiado!" : "Copiar código PIX"}
              </Button>
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-warning/15 p-3 text-sm font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando confirmação do pagamento…
              </div>
            </div>
          </div>
          <ol className="space-y-3 rounded-3xl border bg-card p-5 text-sm shadow-sm">
            <li className="text-sm font-bold">Como pagar</li>
            {[
              `Abra o app do seu banco e escolha PIX Copia e Cola${pix.qr_image ? " ou leia o QR Code" : ""}.`,
              "Cole o código e confirme o pagamento.",
              "Pronto! Esta tela atualiza sozinha e seu código de rastreio é gerado na hora.",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <span className="text-muted-foreground">{t}</span>
              </li>
            ))}
          </ol>
          <Guarantees />

        </div>
      );
    }
    if (lines.length === 0) {
      return (
        <div className="mx-auto max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
          <p className="text-lg font-bold">Seu carrinho está vazio</p>
          <p className="mt-1 text-sm text-muted-foreground">Escolha seu kit Happy Hair e volte aqui para finalizar.</p>
          <Button asChild className="mt-5 h-11 rounded-xl px-6 font-semibold">
            <Link to="/">Ver produtos</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:gap-8">
        {summaryCard}

        <div className="min-w-0 space-y-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Continuar comprando
          </Link>

          {saved && step === 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 pl-4 text-sm">
              <span>
                Bem-vinda de volta! Usar os dados de <b>{saved.customer.name.split(" ")[0]}</b>?
              </span>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" className="rounded-lg" onClick={applySaved}>
                  Usar
                </Button>
                <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setSaved(null)}>
                  Não
                </Button>
              </div>
            </div>
          )}

          {/* 1 — Identificação */}
          <Section
            n={1}
            title="Identificação"
            subtitle="Seus dados para o pedido — e você ganha 10% OFF."
            icon={User}
            active={step === 0}
            done={step > 0}
            onEdit={() => goto(0)}
            summary={
              <>
                <p className="truncate">
                  <span className="font-semibold text-foreground">{customer.name}</span> • {maskPhone(customer.phone)} • {customer.email}
                </p>
                {!coupon && (
                  <p className="font-semibold text-success">🎁 10% OFF liberado — aplique o {IDENTIFICATION_COUPON.code} no pagamento</p>
                )}
              </>
            }
          >
            <form onSubmit={submitIdentity} className="grid grid-cols-1 gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-success/50 bg-success/10 px-3.5 py-3">
                <span className="text-2xl" aria-hidden>🎁</span>
                <p className="text-[13px] leading-snug">
                  {prefilled ? (
                    <>
                      <b className="text-success">Seu 10% OFF já está liberado!</b> Confira seus dados e complete com seu e-mail.
                    </>
                  ) : (
                    <>
                      <b className="text-success">Ganhe 10% OFF agora.</b> Preencha seus dados para liberar o cupom{" "}
                      <b>{IDENTIFICATION_COUPON.code}</b>.
                    </>
                  )}
                </p>
              </div>
              <Field label="Nome completo">
                <Input
                  required
                  autoComplete="name"
                  placeholder="Maria da Silva"
                  aria-label="Nome completo"
                  className={FIELD}
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                />
              </Field>
              <Field label="WhatsApp" hint="Para enviar o rastreio e acompanhar a entrega.">
                <Input
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  aria-label="WhatsApp"
                  className={FIELD}
                  value={maskPhone(customer.phone)}
                  onChange={(e) => setCustomer({ ...customer, phone: onlyDigits(e.target.value) })}
                />
              </Field>
              <Field label="E-mail" hint="Você recebe a confirmação do pedido e o rastreio aqui.">
                <Input
                  required
                  autoFocus={prefilled}
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  aria-label="E-mail"
                  className={FIELD}
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                />
              </Field>
              <div>
                <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base font-bold" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}{prefilled ? "Continuar para entrega" : "Liberar 10% OFF e continuar"}
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </Button>
                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Seus dados são usados apenas para processar o pedido.
                </p>
              </div>
            </form>
          </Section>

          {/* 2 — Entrega */}
          <Section
            n={2}
            title="Entrega"
            subtitle="Frete grátis ou receba mais rápido."
            icon={MapPin}
            active={step === 1}
            done={step > 1}
            onEdit={() => goto(1)}
            summary={
              <>
                <p className="truncate">
                  <span className="font-semibold text-foreground">
                    {address.street}, {address.number}
                    {address.complement ? ` - ${address.complement}` : ""}
                  </span>{" "}
                  • {address.city}/{address.state} • {maskCep(address.cep)}
                </p>
                <p className="text-success">
                  {shipOpt.name} • {shippingCents ? brl(shippingCents) : "Grátis"} • {arrivalLabel(shipOpt)}
                </p>
              </>
            }
          >
            <form onSubmit={submitAddress} className="space-y-5">
              <div className="grid grid-cols-6 gap-3 sm:gap-4">
                <Field label="CEP" className="col-span-6 sm:col-span-3">
                  <div className="relative">
                    <Input
                      required
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      aria-label="CEP"
                      className={FIELD}
                      value={maskCep(address.cep)}
                      onChange={(e) => {
                        const v = onlyDigits(e.target.value);
                        setAddress({ ...address, cep: v });
                        if (v.length === 8) void lookupCep(v);
                      }}
                    />
                    {cepLoading && (
                      <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </Field>
                <div className="col-span-6 flex items-end pb-3 sm:col-span-3">
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Não sei meu CEP
                  </a>
                </div>
                <Field label="Rua / Avenida" className="col-span-6">
                  <Input
                    required
                    autoComplete="address-line1"
                    placeholder="Rua das Flores"
                    aria-label="Rua"
                    className={FIELD}
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  />
                </Field>
                <Field label="Número" className="col-span-2">
                  <Input
                    required
                    placeholder="123"
                    aria-label="Número"
                    className={FIELD}
                    value={address.number}
                    onChange={(e) => setAddress({ ...address, number: e.target.value })}
                  />
                </Field>
                <Field label="Complemento" className="col-span-4">
                  <Input
                    placeholder="Apto, bloco (opcional)"
                    aria-label="Complemento"
                    className={FIELD}
                    value={address.complement}
                    onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                  />
                </Field>
                <Field label="Bairro" className="col-span-6 sm:col-span-2">
                  <Input
                    placeholder="Centro"
                    aria-label="Bairro"
                    className={FIELD}
                    value={address.neighborhood}
                    onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                  />
                </Field>
                <Field label="Cidade" className="col-span-4 sm:col-span-3">
                  <Input
                    required
                    autoComplete="address-level2"
                    placeholder="São Paulo"
                    aria-label="Cidade"
                    className={FIELD}
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  />
                </Field>
                <Field label="UF" className="col-span-2 sm:col-span-1">
                  <Input
                    required
                    maxLength={2}
                    placeholder="SP"
                    aria-label="UF"
                    className={`${FIELD} uppercase`}
                    value={address.state}
                    onChange={(e) =>
                      setAddress({
                        ...address,
                        state: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                      })
                    }
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-foreground/80">Forma de entrega</p>
                {SHIPPING.map((o) => {
                  const on = shipping === o.id;
                  return (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition-colors ${
                        on ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      {o.logo ? (
                        <img src={o.logo === "correios" ? correiosLogo.url : jadlogLogo.url} alt={o.name} width={56} height={28} className="h-7 w-14 shrink-0 object-contain" />
                      ) : (
                        <span className="flex h-7 w-14 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                          <Truck className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{o.name}</span>
                        <span className="block text-xs text-muted-foreground">{arrivalLabel(o)}</span>
                        <span className="block text-[11px] text-muted-foreground/80">{o.description}</span>
                      </span>
                      {o.price_cents ? (
                        <span className="shrink-0 text-sm font-bold">{brl(o.price_cents)}</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">Grátis</span>
                      )}
                      <input type="radio" name="shipping" checked={on} onChange={() => setShipping(o.id)} className="sr-only" aria-label={o.name} />
                    </label>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-12 rounded-xl px-4" onClick={() => goto(0)} aria-label="Voltar">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button type="submit" size="lg" className="h-12 flex-1 rounded-xl text-base font-bold">
                  Continuar para pagamento <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Section>

          {/* 3 — Pagamento */}
          <Section
            n={3}
            title="Pagamento"
            subtitle="Pague com PIX e tenha seu pedido liberado mais rápido."
            icon={CreditCard}
            active={step === 2}
            done={false}
          >
            <div className="space-y-4">
              {/* Forma de pagamento */}
              <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#32BCAD]/15 text-[#1a8f83]">
                  <QrCode className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">PIX</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3 text-success" /> Aprovação imediata
                  </span>
                </span>
                <span className="text-right text-sm font-extrabold text-primary">{brl(total)}</span>
              </div>

              {/* CPF para emissão do PIX */}
              <Field label="CPF" hint="Obrigatório para emitir o PIX.">
                <Input
                  id="pix-cpf"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  aria-label="CPF"
                  className={FIELD}
                  value={maskCpf(customer.cpf)}
                  onChange={(e) => setCustomer({ ...customer, cpf: onlyDigits(e.target.value) })}
                />
              </Field>

              {/* Cupom de identificação: toque para aplicar */}
              {!coupon && (
                <button
                  type="button"
                  onClick={() => void applyCoupon(IDENTIFICATION_COUPON.code)}
                  className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-success/60 bg-success/10 p-3.5 text-left transition hover:bg-success/15 active:scale-[0.99]"
                >
                  <span className="text-2xl" aria-hidden>🎁</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-success">
                      Seu presente: {IDENTIFICATION_COUPON.percent}% OFF liberado!
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Toque para aplicar o cupom <b className="font-mono text-foreground">{IDENTIFICATION_COUPON.code}</b> e pagar{" "}
                      <b className="text-foreground">{brl(subtotal - Math.round((subtotal * IDENTIFICATION_COUPON.percent) / 100) + shippingCents)}</b>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-success px-3 py-2 text-xs font-bold uppercase text-success-foreground">
                    Aplicar
                  </span>
                </button>
              )}

              {/* Cupom */}
              {coupon ? (
                <p className="flex items-center justify-between gap-2 rounded-xl bg-success/10 px-3.5 py-2.5 text-xs font-semibold text-success">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Cupom {coupon.code} aplicado: -{coupon.percent}% ({brl(discount)})
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground underline"
                    onClick={() => {
                      setCoupon(null);
                      setCouponInput("");
                    }}
                  >
                    Remover
                  </button>
                </p>
              ) : couponOpen ? (
                <div className="flex items-center gap-2 rounded-xl border bg-background p-1.5 pl-3.5 focus-within:border-primary">
                  <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    placeholder="Código do cupom"
                    aria-label="Cupom"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void applyCoupon();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <Button type="button" variant="secondary" className="h-9 rounded-lg font-semibold" onClick={() => void applyCoupon()}>
                    Aplicar
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCouponOpen(true)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <Tag className="h-4 w-4" /> Tem outro cupom?
                </button>
              )}

              {/* Total */}
              <div className="rounded-xl bg-muted/50 p-4">
                <div className="flex items-end justify-between">
                  <span className="text-sm font-semibold">Total a pagar</span>
                  <span className="text-2xl font-extrabold leading-none text-primary">{brl(total)}</span>
                </div>
                {savings > 0 && (
                  <p className="mt-1.5 text-right text-xs font-semibold text-success">Você economiza {brl(savings)}</p>
                )}
              </div>

              <Button
                size="lg"
                className="h-14 w-full rounded-2xl text-base font-bold uppercase tracking-wide shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-xl"
                disabled={busy}
                onClick={() => void generatePix()}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                {busy ? "Gerando seu PIX…" : `Gerar PIX — ${brl(total)}`}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" /> O código PIX aparece na próxima tela. Pagamento 100% seguro.
              </p>
              <Guarantees />

              <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => goto(1)}>
                <ArrowLeft className="h-4 w-4" /> Voltar para entrega
              </Button>
            </div>
          </Section>
        </div>
      </div>
    );
  })();

  return (
    <div className="store-theme flex min-h-screen flex-col bg-muted/30">
      <CheckoutHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 md:py-8">{body}</main>
      <CheckoutFooter />
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

/** Cabeçalho enxuto do checkout: só a marca e o selo de segurança (sem distrações). */
function CheckoutHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <Link to="/" className="text-2xl font-extrabold tracking-tight text-primary">
          byhappy
        </Link>
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10">
            <Lock className="h-4 w-4 text-success" />
          </span>
          <span className="leading-tight">
            <span className="block text-xs font-bold text-foreground sm:text-sm">Compra 100% segura</span>
            <span className="block text-[11px] text-muted-foreground">Ambiente protegido</span>
          </span>
        </span>
      </div>
    </header>
  );
}

/** Garantias da compra: envio imediato, rastreio na hora e 30 dias de garantia. */
function Guarantees() {
  const items = [
    { Icon: Zap, title: "Envio imediato", text: "Postamos logo após a aprovação do PIX." },
    { Icon: Truck, title: "Rastreio na hora", text: "Seu código de rastreio é gerado assim que o pagamento é aprovado." },
    { Icon: ShieldCheck, title: "Garantia de 30 dias", text: "Não gostou? Devolvemos seu dinheiro." },
  ];
  return (
    <ul className="grid grid-cols-1 gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-3">
      {items.map(({ Icon, title, text }) => (
        <li key={title} className="flex items-start gap-2.5 rounded-xl p-1.5 sm:flex-col sm:items-center sm:text-center">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <Icon className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[13px] font-bold leading-tight">{title}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function CheckoutFooter() {
  const items = [
    { Icon: Lock, label: "Pagamento protegido" },
    { Icon: ShieldCheck, label: "Ambiente seguro" },
    { Icon: KeyRound, label: "Dados protegidos" },
    { Icon: Headphones, label: "Atendimento ao cliente" },
  ];
  return (
    <footer className="mt-8 border-t bg-card">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {items.map(({ Icon, label }) => (
            <li key={label} className="flex items-center justify-center gap-2 text-xs text-muted-foreground md:justify-start">
              <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} /> {label}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} byhappy • Todos os direitos reservados
        </p>
      </div>
    </footer>
  );
}
