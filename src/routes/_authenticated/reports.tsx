import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Relatórios — Pulsar" }, { name: "description", content: "Relatórios" }] }),
  component: () => (
    <AppShell title="Relatórios">
      <PhasePending phase={3} items={["Filtros por data, canal e campanha", "Tentativa x aceite x entrega", "Exportação CSV"]} />
    </AppShell>
  ),
});
