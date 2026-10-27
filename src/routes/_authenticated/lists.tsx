import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/lists")({
  head: () => ({ meta: [{ title: "Listas e segmentos — Pulsar" }, { name: "description", content: "Listas e segmentos" }] }),
  component: () => (
    <AppShell title="Listas e segmentos">
      <PhasePending phase={2} items={["Listas estáticas", "Segmentos por regras", "Atualização automática", "Respeito ao consentimento por canal"]} />
    </AppShell>
  ),
});
