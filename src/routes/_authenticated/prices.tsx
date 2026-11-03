import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCTS, basePrice, isKit, priceFor, type PriceMap } from "@/lib/catalog";
import { getPublicPrices, savePrices } from "@/lib/prices.functions";
import { brl } from "@/lib/store";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/prices")({
  head: () => ({
    meta: [
      { title: "Preços — Painel Admin" },
      { name: "description", content: "Altere preço e preço 'de' de cada produto da loja." },
    ],
  }),
  component: PricesPage,
});

/** "199,90" → 19990 centavos (NaN se inválido). */
function toCents(v: string): number {
  let s = v.trim().replace(/\s|R\$/g, "");
  // "1.299,90" ou "99,90" → vírgula é o decimal; "99.90" (sem vírgula) → ponto é o decimal.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
const toInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "");

type Row = { price: string; compareAt: string };

function PricesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["product-prices"], queryFn: () => getPublicPrices() });
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current.data) return;
    const next: Record<string, Row> = {};
    for (const p of PRODUCTS) {
      const o = priceFor(p.slug, current.data);
      next[p.slug] = { price: toInput(o.price), compareAt: toInput(o.compareAt) };
    }
    setRows(next);
  }, [current.data]);

  const set = (slug: string, field: keyof Row, value: string) =>
    setRows((r) => ({ ...r, [slug]: { ...r[slug]!, [field]: value } }));

  const reset = (slug: string) => {
    const b = basePrice(slug);
    if (b) setRows((r) => ({ ...r, [slug]: { price: toInput(b.price), compareAt: toInput(b.compareAt) } }));
  };

  async function save() {
    const prices: PriceMap = {};
    for (const p of PRODUCTS) {
      const row = rows[p.slug];
      if (!row) continue;
      const price = toCents(row.price);
      const compareAt = row.compareAt.trim() ? toCents(row.compareAt) : 0;
      if (!Number.isFinite(price) || price < 100)
        return void toast.error(`Preço inválido em "${p.name}". Use, por exemplo, 99,90.`);
      if (!Number.isFinite(compareAt) || compareAt < 0)
        return void toast.error(`Preço "de" inválido em "${p.name}".`);
      prices[p.slug] = { price, compareAt };
    }
    setSaving(true);
    try {
      await savePrices({ data: { prices } });
      await logActivity("prices.update");
      await qc.invalidateQueries({ queryKey: ["product-prices"] });
      await router.invalidate(); // atualiza a loja com os novos preços
      toast.success("Preços salvos! A loja e o checkout já usam os novos valores.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const groups = [
    { title: "Kits", items: PRODUCTS.filter(isKit) },
    { title: "Produtos avulsos", items: PRODUCTS.filter((p) => !isKit(p)) },
  ];

  return (
    <AppShell
      title="Preços"
      actions={
        <Button onClick={() => void save()} disabled={saving || current.isLoading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar preços
        </Button>
      }
    >
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        <b className="text-foreground">Preço</b> é o valor cobrado no PIX.{" "}
        <b className="text-foreground">Preço "de"</b> aparece riscado e calcula o % de desconto (deixe em branco para não
        mostrar). O valor cobrado é sempre recalculado no servidor com estes preços.
      </p>

      {current.isLoading ? (
        <Skeleton className="h-64" />
      ) : current.isError ? (
        <p className="rounded-lg border bg-card p-5 text-sm text-destructive">Não foi possível carregar os preços.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.title}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{g.title}</h2>
              <ul className="divide-y rounded-lg border bg-card">
                {g.items.map((p) => {
                  const row = rows[p.slug] ?? { price: "", compareAt: "" };
                  const price = toCents(row.price);
                  const compareAt = toCents(row.compareAt);
                  const off =
                    Number.isFinite(price) && Number.isFinite(compareAt) && compareAt > price
                      ? Math.round((1 - price / compareAt) * 100)
                      : 0;
                  const perDay = Number.isFinite(price) && p.days > 0 ? Math.round(price / p.days) : NaN;
                  const warn = Number.isFinite(price) && Number.isFinite(compareAt) && compareAt > 0 && compareAt <= price;
                  return (
                    <li key={p.slug} className="flex flex-wrap items-center gap-3 p-3">
                      <img src={p.image} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-md border object-cover" />
                      <div className="min-w-[180px] flex-1">
                        <p className="text-sm font-medium leading-tight">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.days} dias
                          {Number.isFinite(perDay) && ` · ${brl(perDay)}/dia`}
                          {off > 0 && <span className="font-semibold text-success"> · -{off}%</span>}
                          {warn && <span className="font-semibold text-destructive"> · preço "de" deve ser maior</span>}
                        </p>
                      </div>
                      <label className="w-32">
                        <span className="mb-0.5 block text-[11px] text-muted-foreground">Preço (R$)</span>
                        <Input inputMode="decimal" value={row.price} onChange={(e) => set(p.slug, "price", e.target.value)} placeholder="99,90" />
                      </label>
                      <label className="w-32">
                        <span className="mb-0.5 block text-[11px] text-muted-foreground">Preço "de" (R$)</span>
                        <Input inputMode="decimal" value={row.compareAt} onChange={(e) => set(p.slug, "compareAt", e.target.value)} placeholder="199,90" />
                      </label>
                      <Button type="button" variant="ghost" size="icon" title="Voltar ao preço padrão" aria-label={`Voltar ${p.name} ao preço padrão`} onClick={() => reset(p.slug)} className="self-end">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar preços
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
