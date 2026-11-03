import { useEffect, useState } from "react";

const KEY = "byhappy-bf-end";
const DURATION = 15 * 60 * 1000;

/** Barra "Black Friday" com contador de 15 min (reinicia quando zera). */
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
    <div className="flex flex-wrap items-center justify-center gap-3 bg-foreground px-4 py-2.5 text-center text-sm font-bold uppercase tracking-wide text-background">
      <span>🔥 Ofertas Black Friday encerram em</span>
      <span className="rounded-md bg-primary px-3 py-1 font-mono text-base text-primary-foreground" aria-live="polite">{mm}:{ss}</span>
    </div>
  );
}
