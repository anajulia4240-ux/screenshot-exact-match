import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/email")({
  head: () => ({ meta: [{ title: "E-mail marketing — Pulsar" }, { name: "description", content: "E-mail marketing" }] }),
  component: () => (
    <AppShell title="E-mail marketing">
      <PhasePending phase={3} items={["Editor visual e HTML", "Modelos reutilizáveis", "Envio de teste", "Agendamento", "Link de descadastro"]} />
    </AppShell>
  ),
});
