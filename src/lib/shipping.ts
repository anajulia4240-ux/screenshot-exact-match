/**
 * Opções de entrega: uma grátis e duas pagas (mais rápidas), no modelo da loja Gummy.
 * Prazos em dias úteis. Para mudar preço ou prazo, altere aqui: o checkout e o servidor
 * do PIX usam esta mesma lista (o valor cobrado é sempre recalculado no servidor).
 */
export type ShippingId = "gratis" | "sedex" | "jadlog";
export interface ShippingOption {
  id: ShippingId;
  name: string;
  /** Linha de apoio no checkout. */
  description: string;
  price_cents: number;
  minDays: number;
  maxDays: number;
  logo: "correios" | "jadlog" | null;
}

export const SHIPPING: ShippingOption[] = [
  {
    id: "gratis",
    name: "Frete Grátis",
    description: "Correios/Jadlog com código de rastreio",
    price_cents: 0,
    minDays: 7,
    maxDays: 12,
    logo: null,
  },
  {
    id: "sedex",
    name: "SEDEX",
    description: "Correios • mais rápido",
    price_cents: 1190,
    minDays: 3,
    maxDays: 6,
    logo: "correios",
  },
  {
    id: "jadlog",
    name: "Jadlog Expresso",
    description: "Entrega prioritária",
    price_cents: 2416,
    minDays: 1,
    maxDays: 3,
    logo: "jadlog",
  },
];

export const DEFAULT_SHIPPING: ShippingId = "gratis";

/** Opção pelo id (pedidos antigos sem frete salvo caem no padrão). */
export function shippingById(id: string | null | undefined): ShippingOption {
  return SHIPPING.find((s) => s.id === id) ?? SHIPPING[0]!;
}

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
