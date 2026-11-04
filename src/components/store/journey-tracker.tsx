import { useEffect } from "react";
import { track } from "@/lib/track";

/** Seções da página inicial que viram evento quando a pessoa chega nelas (uma vez por visita). */
const SECTIONS: { id: string; label: string }[] = [
  { id: "kits", label: "Kits em destaque" },
  { id: "tratamentos", label: "Qual kit é ideal" },
  { id: "resultados", label: "Resultados reais (vídeos e avaliações)" },
  { id: "faq", label: "Dúvidas frequentes" },
];

/**
 * Registra na aba Eventos até onde a pessoa rolou a página inicial.
 * Não envia nada repetido: cada seção conta uma vez por carregamento.
 */
export function JourneyTracker() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sent = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (!entry.isIntersecting || sent.has(id)) continue;
          sent.add(id);
          const s = SECTIONS.find((x) => x.id === id);
          void track("section_view", { section: id, label: s?.label ?? id });
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.35 },
    );
    // Espera o conteúdo montar.
    const t = window.setTimeout(() => {
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el) io.observe(el);
      }
    }, 800);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  }, []);
  return null;
}
