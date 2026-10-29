import { useSyncExternalStore } from "react";

/** Carrinho guardado no navegador: { slug: quantidade }. */
export type Cart = Record<string, number>;
const KEY = "byhappy-cart";
const EMPTY: Cart = {};
let cache: Cart | null = null;
const listeners = new Set<() => void>();

function read(): Cart {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = parsed && typeof parsed === "object" ? (parsed as Cart) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Cart) {
  cache = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function setQty(slug: string, qty: number) {
  const next = { ...read() };
  if (qty <= 0) delete next[slug];
  else next[slug] = Math.min(20, Math.floor(qty));
  write(next);
}

export const addToCart = (slug: string) => setQty(slug, (read()[slug] ?? 0) + 1);
export const clearCart = () => write({});

export function useCart(): Cart {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    read,
    () => EMPTY,
  );
}
