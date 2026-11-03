import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Loader2, Package, Truck, CreditCard, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";
import { maskCpf, onlyDigits } from "@/lib/br";
import { SHIPPING, addBusinessDays } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rastreio")({
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
  code: string; status: string; created_at: string; paid_at: string | null;
  first_name: string; carrier: string; tracking_code: string | null; items: string[];
}

const STEPS = [
  { label: "Pedido recebido", icon: Package },
  { label: "Pagamento aprovado", icon: CreditCard },
  { label: "Em transporte", icon: Truck },
  { label: "Entregue", icon: Home },
];

function stepOf(o: Order): number {
  if (o.status === "delivered") return 3;
  if (o.status === "shipped" || o.tracking_code) return 2;
  if (o.status === "paid" || o.paid_at) return 1;
  return 0;
}

function OrderCard({ o }: { o: Order }) {
  const current = stepOf(o);
  const ship = SHIPPING.find((s) => s.id === o.carrier) ?? SHIPPING[0]!;
  const eta = o.paid_at ? addBusinessDays(new Date(o.paid_at), ship.maxDays).toLocaleDateString("pt-BR") : null;
  return (
    <article className="rounded-3xl border-2 border-primary/20 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">Pedido #{o.code}</p>
        <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</p>
      </div>
      {o.first_name && <p className="text-sm text-muted-foreground">Olá, {o.first_name}!</p>}
      <ul className="mt-2 text-sm">{o.items.map((i) => <li key={i}>{i}</li>)}</ul>
      <ol className="mt-5 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", i <= current ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>
              {i < current ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </span>
            <span className={cn("text-sm", i === current ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-2xl bg-muted p-3 text-sm">
        <p>Transportadora: <b>{ship.name}</b></p>
        {o.tracking_code && <p>Código de rastreio: <b>{o.tracking_code}</b></p>}
        {eta && current < 3 && <p>Previsão de entrega: <b>até {eta}</b></p>}
        {current === 0 && <p className="text-muted-foreground">Aguardando confirmação do pagamento.</p>}
      </div>
    </article>
  );
}

function TrackPage() {
  const [mode, setMode] = useState<"cpf" | "code">("cpf");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setOrders(null);
    try {
      const body = mode === "cpf" ? { cpf: onlyDigits(value) } : { code: value.trim() };
      const res = await fetch("/api/public/rastreio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { orders?: Order[]; error?: string };
      if (!res.ok) setError(j.error ?? "Não foi possível consultar.");
      else setOrders(j.orders ?? []);
    } catch {
      setError("Sem conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-center text-3xl font-bold">Rastrear pedido</h1>
        <p className="mt-2 text-center text-muted-foreground">Consulte pelo CPF ou pelo código de rastreio.</p>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-muted p-1" role="tablist">
          {(["cpf", "code"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m}
              onClick={() => { setMode(m); setValue(""); setOrders(null); setError(null); }}
              className={cn("rounded-full py-2 text-sm font-semibold", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {m === "cpf" ? "CPF" : "Código de rastreio"}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => void submit(e)} className="mt-4 flex gap-2">
          <Input required value={value} aria-label={mode === "cpf" ? "CPF" : "Código de rastreio"}
            placeholder={mode === "cpf" ? "000.000.000-00" : "Ex.: AB123456789BR"}
            onChange={(e) => setValue(mode === "cpf" ? maskCpf(e.target.value) : e.target.value.toUpperCase())} className="h-12" />
          <Button type="submit" className="h-12 px-6" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rastrear"}</Button>
        </form>
        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
        {orders && orders.length === 0 && <p className="mt-6 text-center text-muted-foreground">Nenhum pedido encontrado.</p>}
        <div className="mt-6 space-y-4">{orders?.map((o) => <OrderCard key={o.code} o={o} />)}</div>
      </main>
      <StoreFooter />
    </div>
  );
}
