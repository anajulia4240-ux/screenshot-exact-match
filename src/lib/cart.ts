import { track } from "@/lib/track";
import { fbqTrack } from "@/lib/fbq";
import { findProduct } from "@/lib/catalog";
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

/** Gaveta do carrinho (aberta/fechada), compartilhada entre cabeçalho e cards. */
let drawerOpen = false;
const drawerListeners = new Set<() => void>();
export function setCartOpen(open: boolean) {
  drawerOpen = open;
  drawerListeners.forEach((l) => l());
}
export function useCartOpen(): boolean {
  return useSyncExternalStore(
    (l) => { drawerListeners.add(l); return () => drawerListeners.delete(l); },
    () => drawerOpen,
    () => false,
  );
}

export const addToCart = (slug: string) => {
  setQty(slug, (read()[slug] ?? 0) + 1);
  void track("add_to_cart", { slug });
  const p = findProduct(slug);
  fbqTrack("AddToCart", { content_ids: [slug], content_name: p?.name, content_type: "product", value: (p?.price ?? 0) / 100, currency: "BRL", quantity: 1 });
  setCartOpen(true);
};
export const clearCart = () => write({});

export function useCart(): Cart {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    read,
    () => EMPTY,
  );
}
