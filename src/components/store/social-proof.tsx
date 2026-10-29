import { useEffect, useState } from "react";
import { ShoppingBag, X } from "lucide-react";
import { KITS } from "@/lib/catalog";

const NAMES = ["Julia", "Ana", "Mariana", "Camila", "Beatriz", "Larissa", "Fernanda", "Patrícia", "Bruna", "Carla", "Renata", "Vanessa", "Aline", "Débora", "Priscila"];
const CITIES = ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Fortaleza", "Salvador", "Goiânia", "Recife", "Manaus", "Florianópolis"];

interface Proof { name: string; city: string; product: string; }

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

function randomProof(): Proof {
  return { name: pick(NAMES), city: pick(CITIES), product: pick(KITS).name };
}

/** Aviso de compra recente no canto inferior esquerdo — fixo, pequeno, não cobre os produtos. */
export function SocialProof() {
  const [proof, setProof] = useState<Proof | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let show: ReturnType<typeof setTimeout>;
    let hide: ReturnType<typeof setTimeout>;
    const cycle = (delay: number) => {
      show = setTimeout(() => {
        setProof(randomProof());
        hide = setTimeout(() => { setProof(null); cycle(12000 + Math.random() * 10000); }, 6000);
      }, delay);
    };
    cycle(4000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  if (!proof || hidden) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-40 flex w-[calc(100%-2rem)] max-w-xs items-start gap-3 rounded-xl border bg-card p-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShoppingBag className="h-4 w-4" />
      </span>
      <p className="flex-1 text-xs leading-snug text-muted-foreground">
        <b className="text-foreground">{proof.name}</b> de {proof.city} acabou de comprar{" "}
        <b className="text-foreground">{proof.product}</b>
      </p>
      <button
        aria-label="Fechar aviso"
        onClick={() => { setHidden(true); setProof(null); }}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
