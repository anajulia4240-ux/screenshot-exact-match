import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Package, Truck, CreditCard, Home, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";
import { maskCpf, onlyDigits } from "@/lib/br";
import { SHIPPING, addBusinessDays } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rastreio")({
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === "string" && s.code.trim() ? { code: s.code.trim().toUpperCase().slice(0, 60) } : {},
  head: () => ({
    meta: [
      { title: "Rastrear pedido — byhappy" },
      { name: "description", content: "Acompanhe seu pedido byhappy pelo CPF ou pelo código de rastreio." },
      { property: "og:title", content: "Rastrear pedido — byhappy" },
      { property: "og:description", content: "Consulte o status da sua entrega." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

interface Order {
  code: string;
  order_code?: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
  first_name: string;
  carrier: string;
  tracking_code: string | null;
  items: string[];
  stage?: string | null;
}

const STEPS = [
  { label: "Pedido recebido", icon: Package },
  { label: "Pagamento aprovado — preparando envio", icon: CreditCard },
  { label: "Em transporte", icon: Truck },
  { label: "Entregue", icon: Home },
];

function stepOf(o: Order): number {
  if (o.status === "delivered" || o.stage === "delivered") return 3;
  if (o.status === "shipped" || o.stage === "shipped" || o.tracking_code) return 2;
  if (o.status === "paid" || o.paid_at) return 1;
  return 0;
}

function OrderCard({ o }: { o: Order }) {
  const current = stepOf(o);
  const ship = SHIPPING.find((s) => s.id === o.carrier) ?? SHIPPING[0]!;
  const carrierName = ship.id === "gratis" ? "Correios/Jadlog" : ship.name;
  const eta = o.paid_at ? addBusinessDays(new Date(o.paid_at), ship.maxDays).toLocaleDateString("pt-BR") : null;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Código copiado!");
    } catch {
      /* ignorado */
    }
  };
  return (
    <article className="rounded-3xl border-2 border-primary/20 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">Pedido #{o.code}</p>
        <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</p>
      </div>
      {o.first_name && <p className="text-sm text-muted-foreground">Olá, {o.first_name}!</p>}
      <ul className="mt-2 text-sm">
        {o.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <ol className="mt-5 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                i <= current ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i < current ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </span>
            <span className={cn("text-sm", i === current ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-1 rounded-2xl bg-muted p-3 text-sm">
        {o.order_code && (
          <p className="flex items-center gap-1.5">
            Código de rastreio: <b className="font-mono">{o.order_code}</b>
            <button type="button" aria-label="Copiar código" onClick={() => void copy(o.order_code!)} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </p>
        )}
        <p>
          Transportadora: <b>{carrierName}</b>
        </p>
        {o.tracking_code && (
          <p>
            Código {carrierName}: <b className="font-mono">{o.tracking_code}</b>
          </p>
        )}
        {eta && current < 3 && (
          <p>
            Previsão de entrega: <b>até {eta}</b>
          </p>
        )}
        {current === 1 && !o.tracking_code && (
          <p className="text-muted-foreground">
            Envio imediato: seu pedido já está na fila de postagem. O código da transportadora aparece aqui assim que for postado.
          </p>
        )}
        {current === 0 && <p className="text-muted-foreground">Aguardando confirmação do pagamento.</p>}
      </div>
    </article>
  );
}

function TrackPage() {
  const { code: initialCode } = Route.useSearch();
  const [mode, setMode] = useState<"cpf" | "code">(initialCode ? "code" : "cpf");
  const [value, setValue] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const autoRan = useRef(false);

  const search = async (m: "cpf" | "code", v: string) => {
    setBusy(true);
    setError(null);
    setOrders(null);
    try {
      const body = m === "cpf" ? { cpf: onlyDigits(v) } : { code: v.trim() };
      const res = await fetch("/api/public/rastreio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { orders?: Order[]; error?: string };
      if (!res.ok) setError(j.error ?? "Não foi possível consultar.");
      else setOrders(j.orders ?? []);
    } catch {
      setError("Sem conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  // Link do checkout (/rastreio?code=BHY…) já abre com o pedido consultado.
  useEffect(() => {
    if (initialCode && !autoRan.current) {
      autoRan.current = true;
      void search("code", initialCode);
    }
  }, [initialCode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void search(mode, value);
  };

  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-center text-3xl font-bold">Rastrear pedido</h1>
        <p className="mt-2 text-center text-muted-foreground">Consulte pelo CPF ou pelo código de rastreio.</p>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-muted p-1" role="tablist">
          {(["cpf", "code"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setValue("");
                setOrders(null);
                setError(null);
              }}
              className={cn(
                "rounded-full py-2 text-sm font-semibold",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {m === "cpf" ? "CPF" : "Código de rastreio"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <Input
            required
            value={value}
            aria-label={mode === "cpf" ? "CPF" : "Código de rastreio"}
            placeholder={mode === "cpf" ? "000.000.000-00" : "Ex.: BHY7K2M9QX4P"}
            onChange={(e) => setValue(mode === "cpf" ? maskCpf(e.target.value) : e.target.value.toUpperCase())}
            className="h-12"
          />
          <Button type="submit" className="h-12 px-6" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rastrear"}
          </Button>
        </form>
        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
        {orders && orders.length === 0 && <p className="mt-6 text-center text-muted-foreground">Nenhum pedido encontrado.</p>}
        <div className="mt-6 space-y-4">
          {orders?.map((o) => (
            <OrderCard key={o.code} o={o} />
          ))}
        </div>
      </main>
      <StoreFooter />
    </div>
  );
}
