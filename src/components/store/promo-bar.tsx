import { useEffect, useState } from "react";

const KEY = "byhappy-bf-end";
const DURATION = 15 * 60 * 1000;

/** Barra "Black Friday" fina e fixa abaixo do cabeçalho, com contador de 15 min (reinicia quando zera). */
export function PromoBar() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const getEnd = () => {
      const saved = Number(localStorage.getItem(KEY));
      if (saved > Date.now()) return saved;
      const end = Date.now() + DURATION;
      localStorage.setItem(KEY, String(end));
      return end;
    };
    let end = getEnd();
    const tick = () => {
      if (end <= Date.now()) end = getEnd();
      setLeft(end - Date.now());
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((left ?? DURATION) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div className="sticky top-16 z-10 flex items-center justify-center gap-2 bg-foreground/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-background shadow-sm backdrop-blur sm:gap-3 sm:text-xs">
      <span className="truncate">
        🔥 <span className="sm:hidden">Black Friday acaba em</span>
        <span className="hidden sm:inline">Ofertas Black Friday encerram em</span>
      </span>
      <span className="shrink-0 rounded bg-primary px-2 py-0.5 font-mono text-xs text-primary-foreground sm:text-sm" aria-live="polite">{mm}:{ss}</span>
    </div>
  );
}
