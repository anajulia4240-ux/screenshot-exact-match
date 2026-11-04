import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSessionId, getTracking, track } from "@/lib/track";
import { fbqIdentify, fbqTrack, type MatchInput } from "@/lib/fbq";
import { isValidPhone, maskPhone, onlyDigits } from "@/lib/br";
import { IDENTIFICATION_COUPON } from "@/lib/coupon-defaults";

/**
 * Identificação de quem chega pelo anúncio (mesmo modelo da Gummy):
 * pede nome + WhatsApp ao entrar, cria o lead na hora e libera o cupom HAPPY10.
 * A partir daí tudo o que a pessoa faz no site aparece no card dela na aba Eventos.
 *
 * Para testar sem anúncio: abra o site com ?identificar=1 no final do endereço.
 */

const LEAD_KEY = "byhappy_lead";
const CUSTOMER_KEY = "byhappy_customer";
const SEEN_KEY = "byhappy_identify_seen";
const FROM_AD_KEY = "byhappy_from_ad";
/** Quem fechou o pop-up só vê de novo depois de 24h. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** Espera a página carregar antes de abrir (a pessoa vê a oferta primeiro). */
const OPEN_DELAY_MS = 2500;

const AD_PARAMS = ["fbclid", "gclid", "ttclid", "utm_source", "utm_campaign", "utm_medium", "src", "ad_id", "campaign_id"];
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck"];

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value);
  } catch {
    /* ignorado */
  }
}

/** Veio do anúncio agora (parâmetros na URL) ou já veio nesta visita. */
function cameFromAd(params: URLSearchParams): boolean {
  if (AD_PARAMS.some((k) => params.get(k))) {
    safeSet(sessionStorage, FROM_AD_KEY, "1");
    return true;
  }
  return safeGet(sessionStorage, FROM_AD_KEY) === "1";
}

function alreadyIdentified(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null") as {
      customer?: { name?: string; phone?: string };
    } | null;
    return !!(v?.customer?.name && v.customer.phone);
  } catch {
    return false;
  }
}

function snoozed(): boolean {
  const at = Number(safeGet(localStorage, SEEN_KEY) || 0);
  return !!at && Date.now() - at < SNOOZE_MS;
}

export function IdentifyModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get("identificar") === "1";
    if (!forced && (!cameFromAd(params) || alreadyIdentified() || snoozed())) return;
    const t = window.setTimeout(() => {
      setOpen(true);
      void track("identification_shown");
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Trava a rolagem da página enquanto o pop-up está aberto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function close(skipped: boolean) {
    setOpen(false);
    safeSet(localStorage, SEEN_KEY, String(Date.now()));
    if (skipped) void track("identification_skipped");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (cleanName.split(" ").length < 2) return setError("Digite seu nome e sobrenome.");
    if (!isValidPhone(phone)) return setError("WhatsApp inválido. Use DDD + número.");
    setBusy(true);
    try {
      // Garante a sessão antes do lead, para ligar a navegação ao lead na aba Eventos.
      if (!getSessionId()) await track("page_view");
      const t = getTracking();
      const utm: Record<string, string> = {};
      for (const k of UTM_KEYS) if (t[k]) utm[k] = t[k];
      const res = await fetch("/api/public/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: safeGet(localStorage, LEAD_KEY),
          session_id: getSessionId(),
          name: cleanName,
          phone: onlyDigits(phone),
          utm,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { lead_id?: string; error?: string };
      if (!res.ok || !j.lead_id) throw new Error(j.error ?? "Não foi possível salvar. Tente de novo.");
      safeSet(localStorage, LEAD_KEY, j.lead_id);
      // O checkout já abre com nome e WhatsApp preenchidos.
      safeSet(
        localStorage,
        CUSTOMER_KEY,
        JSON.stringify({ customer: { name: cleanName, phone: onlyDigits(phone), email: "", cpf: "" } }),
      );
      safeSet(localStorage, SEEN_KEY, String(Date.now()));
      const match = { name: cleanName, phone: onlyDigits(phone) } as MatchInput;
      fbqIdentify(match);
      fbqTrack("Lead", { content_name: "identificacao_site" });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const first = name.trim().split(" ")[0] ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="identify-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <button
          type="button"
          onClick={() => close(!done)}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-muted-foreground hover:bg-black/10"
        >
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div className="px-6 pb-7 pt-8 text-center">
            <p className="text-5xl" aria-hidden>
              🎉
            </p>
            <h2 id="identify-title" className="mt-3 text-2xl font-extrabold">
              Pronto, {first}!
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Seu desconto está garantido:</p>
            <div className="mx-auto mt-3 w-fit rounded-2xl border-2 border-dashed border-success/60 bg-success/10 px-6 py-3">
              <p className="font-mono text-2xl font-extrabold tracking-wider text-success">{IDENTIFICATION_COUPON.code}</p>
              <p className="text-xs font-semibold text-success">{IDENTIFICATION_COUPON.percent}% OFF no PIX</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">É só tocar no cupom na hora do pagamento que ele é aplicado.</p>
            <Button
              size="lg"
              className="mt-5 h-12 w-full rounded-xl text-base font-bold"
              onClick={() => {
                close(false);
                document.getElementById("kits")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Escolher meu kit
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="px-6 pb-6 pt-7">
            <div className="text-center">
              <span className="inline-block rounded-full bg-success/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-success">
                🎁 Presente de boas-vindas
              </span>
              <h2 id="identify-title" className="mt-3 text-2xl font-extrabold leading-tight">
                Ganhe <span className="text-primary">{IDENTIFICATION_COUPON.percent}% OFF</span> no seu kit
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Informe seu nome e WhatsApp para liberar o cupom agora.
              </p>
            </div>
            <div className="mt-5 space-y-3">
              <Input
                autoFocus
                autoComplete="name"
                placeholder="Nome e sobrenome"
                aria-label="Nome e sobrenome"
                className="h-12 rounded-xl text-[15px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                inputMode="tel"
                autoComplete="tel"
                placeholder="WhatsApp com DDD"
                aria-label="WhatsApp"
                className="h-12 rounded-xl text-[15px]"
                value={maskPhone(phone)}
                onChange={(e) => setPhone(onlyDigits(e.target.value))}
              />
            </div>
            {error && <p className="mt-2 text-center text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="mt-4 h-12 w-full rounded-xl text-base font-bold" disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Liberar meu desconto"}
            </Button>
            <button
              type="button"
              onClick={() => close(true)}
              className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Agora não, quero ver sem desconto
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Usamos seu WhatsApp só para o pedido e o rastreio. Nada de spam.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
