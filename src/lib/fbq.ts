/** Meta Pixel: wrappers seguros (nunca quebram a página). O ID é público. */
export const META_PIXEL_ID = "1292096212405792";
const TEST_KEY = "byhappy_test_event_code";

type FbqFn = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[] };
declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
    pixelId?: string;
  }
}

function call(...args: unknown[]): void {
  try {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    window.fbq(...args);
  } catch {
    /* ignorado */
  }
}

export function fbqTrack(event: string, params?: Record<string, unknown>, opts?: { eventID?: string }): void {
  call("track", event, params ?? {}, opts?.eventID ? { eventID: opts.eventID } : undefined);
}

export function fbqTrackCustom(event: string, params?: Record<string, unknown>, opts?: { eventID?: string }): void {
  call("trackCustom", event, params ?? {}, opts?.eventID ? { eventID: opts.eventID } : undefined);
}

const low = (v: string) => v.trim().toLowerCase();
const digits = (v: string) => v.replace(/\D/g, "");
const plain = (v: string) => low(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");

export interface MatchInput {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  cep?: string;
  city?: string;
  state?: string;
}

/** Advanced Matching: re-init com dados normalizados (o Pixel faz o hash). */
export function fbqIdentify(d: MatchInput): void {
  const parts = (d.name ?? "").trim().split(/\s+/).filter(Boolean);
  const ph = digits(d.phone ?? "");
  const data: Record<string, string> = { country: "br" };
  if (d.email) data["em"] = low(d.email);
  if (ph) data["ph"] = ph.startsWith("55") ? ph : `55${ph}`;
  if (parts[0]) data["fn"] = plain(parts[0]);
  if (parts.length > 1) data["ln"] = plain(parts[parts.length - 1] ?? "");
  if (d.city) data["ct"] = plain(d.city);
  if (d.state) data["st"] = low(d.state);
  if (d.cep) data["zp"] = digits(d.cep);
  if (d.cpf && digits(d.cpf)) data["external_id"] = digits(d.cpf);
  // Guarda para o init do Pixel em __root.tsx reaplicar em toda página (igual à Gummy).
  try {
    localStorage.setItem("byhappy_fb_am", JSON.stringify(data));
  } catch {
    /* ignorado */
  }
  call("init", META_PIXEL_ID, data, { agent: "lovable" });
}

/** Guarda ?test_event_code=XXX da URL para mandar na CAPI. */
export function captureTestEventCode(): void {
  try {
    const c = new URLSearchParams(window.location.search).get("test_event_code");
    if (c && /^[A-Za-z0-9_-]{1,40}$/.test(c)) localStorage.setItem(TEST_KEY, c);
  } catch {
    /* ignorado */
  }
}
export function getTestEventCode(): string | null {
  try {
    return localStorage.getItem(TEST_KEY);
  } catch {
    return null;
  }
}

/** Purchase uma vez só por pedido. */
export function purchaseOnce(orderId: string, fire: () => void): void {
  const k = `byhappy_purchase_${orderId}`;
  try {
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
  } catch {
    /* sem storage: dispara mesmo assim */
  }
  fire();
}
