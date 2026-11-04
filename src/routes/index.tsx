import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, ShoppingCart } from "lucide-react";
import { AVULSOS, KITS, type Product } from "@/lib/catalog";
import { addToCart } from "@/lib/cart";
import { brl } from "@/lib/store";
import { SHIPPING } from "@/lib/shipping";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";
import { SocialProof } from "@/components/store/social-proof";
import { VideoSection } from "@/components/store/video-section";
import { ReviewsSection } from "@/components/store/reviews-section";
import { PromoBar } from "@/components/store/promo-bar";
import { WhatsAppButton } from "@/components/store/whatsapp-button";
import bannerAsset from "@/assets/banner-byhappy.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "byhappy | Kits Happy Hair com Brindes e Frete Grátis" },
      { name: "description", content: "Kits Happy Hair originais com brindes e até 80% de desconto. Revendedora autorizada, pagamento via PIX." },
      { property: "og:title", content: "byhappy | Kits Happy Hair com Brindes e Frete Grátis" },
      { property: "og:description", content: "Kits Happy Hair originais com desconto e brindes grátis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StorePage,
});

/** Kit que a loja quer destacar (troque o slug para destacar outro). */
const RECOMMENDED_SLUG = "happy-hair-3-potes-colageno-gratis";

const offOf = (p: Product) => (p.compareAt > p.price ? Math.round((1 - p.price / p.compareAt) * 100) : 0);
const perDay = (p: Product) => (p.days > 0 ? Math.round(p.price / p.days) : 0);
const savingOf = (p: Product) => Math.max(0, p.compareAt - p.price);

/** Kit com menor preço por dia (calculado com os preços atuais do painel). */
function bestValueSlug(): string | null {
  const sorted = [...KITS].filter((k) => k.days > 0).sort((a, b) => perDay(a) - perDay(b));
  return sorted[0]?.slug ?? null;
}

function buy(p: Product) {
  addToCart(p.slug);
  toast.success("Adicionado ao carrinho.");
}

function ProductCard({ p, badge }: { p: Product; badge?: "recommended" | "best" }) {
  const off = offOf(p);
  const saving = savingOf(p);
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg ${
        badge === "recommended" ? "border-2 border-primary shadow-md shadow-primary/10" : ""
      }`}
    >
      <div className="relative aspect-square bg-muted">
        <img src={p.image} alt={p.name} loading="lazy" width={400} height={400} className="h-full w-full object-cover" />
        {off > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow-sm sm:px-2.5 sm:py-1 sm:text-xs">
            -{off}%
          </span>
        )}
        {badge && (
          <span
            className={`absolute inset-x-0 bottom-0 truncate py-1 text-center text-[10px] font-extrabold uppercase tracking-wide sm:py-1.5 sm:text-xs ${
              badge === "recommended" ? "bg-primary text-primary-foreground" : "bg-amber-400 text-amber-950"
            }`}
          >
            {badge === "recommended" ? "⭐ Recomendado" : "💎 Custo-benefício"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <h3 className="line-clamp-3 min-h-[3.4rem] text-[13px] font-semibold leading-snug sm:min-h-[3.75rem] sm:text-sm">{p.name}</h3>
        <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{p.days} dias de tratamento</p>
        <div className="mt-auto space-y-1">
          {off > 0 && <p className="text-[11px] text-muted-foreground line-through sm:text-xs">de {brl(p.compareAt)}</p>}
          <p className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-lg font-extrabold leading-none text-primary sm:text-2xl">{brl(p.price)}</span>
            <span className="text-[10px] font-semibold text-success sm:text-[11px]">no PIX</span>
          </p>
          {perDay(p) > 0 && (
            <p className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 sm:text-[11px]">
              só {brl(perDay(p))}/dia
            </p>
          )}
          {saving > 0 && (
            <p className="text-[10px] font-bold leading-tight text-success sm:text-[11px]">Economize {brl(saving)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => buy(p)}
          className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-success text-[13px] font-extrabold uppercase tracking-wide text-success-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98] sm:text-sm"
        >
          <ShoppingCart className="h-4 w-4" /> Comprar
        </button>
      </div>
    </article>
  );
}

function KitChooser({ recommended }: { recommended: string }) {
  const kits = [...KITS].sort((a, b) => a.days - b.days);
  return (
    <section id="tratamentos" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-extrabold md:text-3xl">Qual kit é ideal pra você?</h2>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          O Happy Hair é tomado <b className="text-foreground">1 cápsula por dia</b>, e cada pote dura 30 dias. Como o
          cuidado é contínuo, os kits maiores cobrem mais tempo de tratamento e saem <b className="text-foreground">mais
          baratos por dia</b>.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
        {kits.map((k) => {
          const rec = k.slug === recommended;
          return (
            <div
              key={k.slug}
              className={`flex flex-col overflow-hidden rounded-2xl border bg-card ${rec ? "border-2 border-primary shadow-lg shadow-primary/10" : ""}`}
            >
              <div className="relative aspect-square bg-white">
                <img src={k.image} alt={k.name} loading="lazy" width={300} height={300} className="h-full w-full object-cover" />
                {rec && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-primary py-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-primary-foreground sm:py-1.5 sm:text-xs">
                    ⭐ Recomendado
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-2.5 sm:p-4">
                <p className="leading-none">
                  <span className="text-2xl font-extrabold text-primary sm:text-3xl">{k.days}</span>{" "}
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">dias</span>
                </p>
                <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[11px] font-semibold leading-snug sm:min-h-[2.5rem] sm:text-sm">{k.name}</p>
                <dl className="mt-2 space-y-0.5 text-[11px] sm:mt-3 sm:space-y-1 sm:text-sm">
                  <div className="flex justify-between gap-1">
                    <dt className="text-muted-foreground">Por dia</dt>
                    <dd className="font-bold text-amber-700">{brl(perDay(k))}</dd>
                  </div>
                  <div className="flex justify-between gap-1">
                    <dt className="text-muted-foreground">Economia</dt>
                    <dd className="font-bold text-success">{brl(savingOf(k))}</dd>
                  </div>
                  <div className="flex justify-between gap-1 border-t pt-1">
                    <dt className="font-semibold">Total</dt>
                    <dd className="font-extrabold text-primary">{brl(k.price)}</dd>
                  </div>
                </dl>
                <div className="mt-auto pt-3">
                <button
                  type="button"
                  onClick={() => buy(k)}
                  className={`h-9 w-full rounded-xl text-[11px] font-extrabold uppercase tracking-wide transition active:scale-[0.98] sm:h-10 sm:text-sm ${
                    rec ? "bg-success text-success-foreground hover:brightness-110" : "border-2 border-success text-success hover:bg-success/10"
                  }`}
                >
                  Escolher
                </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-[11px] text-muted-foreground">*Os resultados podem variar de pessoa para pessoa.</p>
    </section>
  );
}

function Faq() {
  const sedex = SHIPPING.find((s) => s.id === "sedex") ?? SHIPPING[0]!;
  const jadlog = SHIPPING.find((s) => s.id === "jadlog");
  const items = [
    {
      q: "O produto é original?",
      a: "Sim. A byhappy é revendedora autorizada Happy Hair e envia somente produtos originais, direto para a sua casa.",
    },
    {
      q: "Quanto tempo demora para chegar?",
      a: `O frete é grátis para todo o Brasil. Pelo SEDEX, o prazo é de ${sedex.minDays} a ${sedex.maxDays} dias úteis${
        jadlog ? `; pela Jadlog, de ${jadlog.minDays} a ${jadlog.maxDays} dias úteis` : ""
      }, contados após a confirmação do pagamento. Você acompanha tudo em "Rastrear pedido", no topo do site.`,
    },
    {
      q: "Como tomar o Happy Hair?",
      a: "1 cápsula por dia, de preferência junto com uma refeição e um copo de água. Cada pote tem 30 cápsulas e dura 30 dias. Para os demais produtos (colágeno, melatonina e creatina), siga as orientações do rótulo.",
    },
    {
      q: "Em quanto tempo vejo resultado?",
      a: "Cada organismo responde de um jeito, e os resultados variam de pessoa para pessoa. Por ser um suplemento, o ideal é manter o uso diário e contínuo — por isso recomendamos os kits de 90 dias ou mais.",
    },
    {
      q: "Pagar com PIX é seguro?",
      a: "Sim. Você paga pelo app do seu banco, lendo o QR Code ou usando o código Copia e Cola gerado no checkout. A confirmação é automática e aparece na tela em poucos segundos.",
    },
    {
      q: "Posso pagar com cartão ou boleto?",
      a: "No momento as vendas são somente por PIX — é o que nos permite oferecer os descontos dos kits e a aprovação imediata do pedido.",
    },
    {
      q: "Ainda tenho dúvidas. Como falo com vocês?",
      a: "É só tocar no botão verde do WhatsApp, no canto da tela. Atendemos de segunda a sexta, das 8h às 18h.",
    },
  ];
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-28 px-4 py-12">
      <h2 className="text-center text-2xl font-extrabold md:text-3xl">Perguntas frequentes</h2>
      <div className="mt-6 divide-y rounded-2xl border bg-card">
        {items.map(({ q, a }) => (
          <details key={q} className="group px-4 py-1 sm:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-sm font-semibold sm:text-base [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function StorePage() {
  const best = bestValueSlug();
  const badgeFor = (slug: string): "recommended" | "best" | undefined =>
    slug === RECOMMENDED_SLUG ? "recommended" : slug === best ? "best" : undefined;

  return (
    <div className="store-theme min-h-screen">
      <StoreHeader />
      <PromoBar />
      <div className="relative">
        <img src={bannerAsset.url} alt="Promoção byhappy" className="w-full" />
      </div>
      <section className="mx-auto max-w-6xl px-4 pb-4 pt-8 text-center sm:pb-6 sm:pt-10">
        <h1 className="text-2xl font-bold sm:text-3xl md:text-4xl">Kits Happy Hair com brindes grátis</h1>
        <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2 sm:text-base">Quanto maior o kit, maior o desconto — até 80% off.</p>
      </section>
      <main className="mx-auto max-w-6xl px-4 pb-6">
        <h2 id="kits" className="mb-3 scroll-mt-28 text-lg font-bold sm:mb-4 sm:text-xl">Kits em destaque</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {KITS.map((p) => <ProductCard key={p.slug} p={p} badge={badgeFor(p.slug)} />)}
        </div>
      </main>
      <KitChooser recommended={RECOMMENDED_SLUG} />
      <section className="mx-auto max-w-6xl px-4 pb-10">
        <h2 className="mb-3 text-lg font-bold sm:mb-4 sm:text-xl">Produtos avulsos</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {AVULSOS.map((p) => <ProductCard key={p.slug} p={p} />)}
        </div>
      </section>
      <div id="resultados" className="scroll-mt-28">
        <VideoSection />
        <ReviewsSection />
      </div>
      <Faq />
      <StoreFooter />
      <SocialProof />
      <WhatsAppButton />
    </div>
  );
}
