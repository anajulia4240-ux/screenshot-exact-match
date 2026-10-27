import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrações — Pulsar" }, { name: "description", content: "Integrações" }] }),
  component: () => (
    <AppShell title="Integrações">
      <PhasePending phase={3} items={["Provedor de e-mail (SES/Resend)", "Status SPF/DKIM/DMARC", "WhatsApp Business Platform", "Webhooks autenticados", "Teste de conexão"]} />
    </AppShell>
  ),
});
