import { useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { REVIEWS } from "@/lib/reviews";
import { Button } from "@/components/ui/button";

/** Real customer reviews provided by Happy Hair, with photos. */
export function ReviewsSection() {
  const [shown, setShown] = useState(8);
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10">
      <h2 className="text-xl font-bold">Resultados reais</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Veja o que as clientes têm a dizer. *Os resultados podem variar de pessoa para pessoa.
      </p>
      <div className="columns-2 gap-4 md:columns-4">
        {REVIEWS.slice(0, shown).map((r) => (
          <article key={r.image} className="mb-4 break-inside-avoid overflow-hidden rounded-xl border bg-card">
            <img src={r.image} alt={`Foto da avaliação de ${r.name}`} loading="lazy" className="w-full object-cover" />
            <div className="space-y-1 p-3">
              <div className="flex text-primary" aria-label="5 estrelas">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
              <p className="flex items-center gap-1 text-sm font-semibold">
                {r.name}
                {r.verified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Compra verificada" />}
              </p>
              <p className="text-sm">{r.text}</p>
            </div>
          </article>
        ))}
      </div>
      {shown < REVIEWS.length && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setShown((n) => n + 8)}>Ver mais avaliações</Button>
        </div>
      )}
    </section>
  );
}
