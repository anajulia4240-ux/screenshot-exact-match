import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automações — Pulsar" }, { name: "description", content: "Automações" }] }),
  component: () => (
    <AppShell title="Automações">
      <PhasePending phase={5} items={["Gatilhos e condições", "Sequências com intervalos", "Histórico de execuções", "Registro de erros"]} />
    </AppShell>
  ),
});
