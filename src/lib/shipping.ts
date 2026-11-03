/** Opções de entrega (frete grátis em todas). Prazos em dias úteis. */
export type ShippingId = "sedex" | "jadlog";
export interface ShippingOption {
  id: ShippingId;
  name: string;
  minDays: number;
  maxDays: number;
}
export const SHIPPING: ShippingOption[] = [
  { id: "sedex", name: "SEDEX", minDays: 3, maxDays: 6 },
  { id: "jadlog", name: "Jadlog", minDays: 7, maxDays: 12 },
];

/** Soma dias úteis (pula sábado e domingo). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}

const ddmm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** "Chega entre 12/11 e 18/11" */
export function arrivalLabel(o: ShippingOption, from = new Date()): string {
  return `Chega entre ${ddmm(addBusinessDays(from, o.minDays))} e ${ddmm(addBusinessDays(from, o.maxDays))}`;
}
