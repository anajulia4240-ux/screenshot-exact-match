import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({ meta: [{ title: "Contatos — Pulsar" }, { name: "description", content: "Contatos" }] }),
  component: () => (
    <AppShell title="Contatos">
      <PhasePending phase={2} items={["Cadastro, edição e exclusão", "Busca e filtros", "Importação CSV/XLSX com mapeamento", "Tratamento de duplicados", "Tags em massa", "Histórico por contato"]} />
    </AppShell>
  ),
});
