import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getSessionId, getTracking, track } from "@/lib/track";
import { fbqIdentify } from "@/lib/fbq";
import { maskPhone, onlyDigits } from "@/lib/br";
import { IDENTIFICATION_COUPON } from "@/lib/coupon-defaults";
import { IDENTIFICATION_DELAY_MS, identificationSchema, shouldShowIdentification, WELCOME_COUPON_KEY } from "@/lib/identification";
import logo from "@/assets/happy-hair-logo.png.asset.json";

export function IdentifyModal() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const valid = identificationSchema.safeParse({ name, phone }).success;

  useEffect(() => {
    let leadId: string | null = null;
    try { leadId = localStorage.getItem("byhappy_lead"); } catch { /* storage indisponível */ }
    if (!shouldShowIdentification(pathname, leadId)) { setOpen(false); return; }
    const timer = window.setTimeout(() => setOpen(true), IDENTIFICATION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = identificationSchema.safeParse({ name, phone });
    if (!parsed.success || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const tracking = getTracking();
      const utm = Object.fromEntries(Object.entries(tracking).filter(([key]) => key.startsWith("utm_")).map(([key, value]) => [key, value.slice(0, 200)]));
      const response = await fetch("/api/public/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, identification: true, session_id: getSessionId(), utm }),
      });
      const result = await response.json() as { lead_id?: string };
      if (!response.ok || !result.lead_id) throw new Error("save");
      localStorage.setItem("byhappy_lead", result.lead_id);
      localStorage.setItem("byhappy_customer", JSON.stringify({ customer: { ...parsed.data, email: "", cpf: "" } }));
      localStorage.setItem(WELCOME_COUPON_KEY, JSON.stringify(IDENTIFICATION_COUPON));
      fbqIdentify(parsed.data);
      setOpen(false);
      // A loja já está liberada: somente o vínculo e os eventos seguem em segundo plano.
      void Promise.allSettled([
        track("lead_captured", { ...parsed.data, lead_id: result.lead_id }).then(() => track("page_view", { page: window.location.pathname })),
      ]);
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }

  return (
    <Dialog open={open && !pathname.startsWith("/checkout")}>
      <DialogContent showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="store-theme w-[calc(100%-32px)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border-0 bg-card px-6 py-8 sm:rounded-3xl sm:px-8 sm:py-10">
        <form onSubmit={(event) => void submit(event)} className="text-center">
          <img src={logo.url} alt="Happy Hair" className="mx-auto h-12 w-auto rounded-md bg-primary p-1 object-contain sm:h-14" />
          <DialogTitle className="mt-6 text-2xl font-normal text-primary sm:text-3xl">Ganhe <strong className="font-bold">10% OFF</strong></DialogTitle>
          <DialogDescription className="mt-2 text-base">Na sua primeira compra</DialogDescription>
          <div className="mt-7 space-y-4">
            <Input aria-label="Nome" placeholder="Nome" autoComplete="name" maxLength={60} value={name}
              onChange={(event) => setName(event.target.value)} disabled={busy}
              className="h-14 rounded-3xl border-2 border-primary bg-secondary/50 text-base" />
            <Input aria-label="WhatsApp" placeholder="Digite seu melhor número" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={16}
              value={maskPhone(phone)} onChange={(event) => setPhone(onlyDigits(event.target.value).slice(0, 11))} disabled={busy}
              className="h-14 rounded-3xl border-2 border-primary bg-secondary/50 text-base" />
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!valid || busy} className="mt-6 h-14 w-[85%] rounded-3xl text-lg font-bold sm:h-16">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            {busy ? "SALVANDO..." : "CONFIRMAR"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
