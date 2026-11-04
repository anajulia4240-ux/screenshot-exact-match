import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { KITS } from "@/lib/catalog";
import buyer1 from "@/assets/buyer-1.jpg";
import buyer2 from "@/assets/buyer-2.jpg";
import buyer3 from "@/assets/buyer-3.jpg";
import buyer4 from "@/assets/buyer-4.jpg";

const PHOTOS = [buyer1, buyer2, buyer3, buyer4];
const NAMES = ["Julia", "Ana", "Mariana", "Camila", "Beatriz", "Larissa", "Fernanda", "Patrícia", "Bruna", "Carla", "Renata", "Vanessa", "Aline", "Débora", "Priscila"];
const CITIES = ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Fortaleza", "Salvador", "Goiânia", "Recife", "Manaus", "Florianópolis"];

interface Proof { name: string; city: string; product: string; photo: string; }

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

function randomProof(): Proof {
  return { name: pick(NAMES), city: pick(CITIES), product: pick(KITS).name, photo: pick(PHOTOS) };
}

/** Aviso compacto de compra recente no canto inferior esquerdo. */
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
      className="fixed bottom-3 left-3 z-40 flex max-w-[240px] items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2 shadow-md animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <img src={proof.photo} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      <p className="flex-1 text-[11px] leading-tight text-muted-foreground">
        <b className="text-foreground">{proof.name}</b> de {proof.city} comprou{" "}
        <b className="text-foreground">{proof.product}</b>
      </p>
      <button aria-label="Fechar aviso" onClick={() => { setHidden(true); setProof(null); }} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
