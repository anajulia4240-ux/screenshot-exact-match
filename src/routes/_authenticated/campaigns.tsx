import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campanhas — Pulsar" }, { name: "description", content: "Campanhas" }] }),
  component: () => (
    <AppShell title="Campanhas">
      <PhasePending phase={3} items={["Construtor em etapas", "Validação de destinatários", "Confirmação antes do envio", "Proteção contra disparo duplicado"]} />
    </AppShell>
  ),
});
