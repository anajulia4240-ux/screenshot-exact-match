import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PhasePending } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Pulsar" }, { name: "description", content: "WhatsApp" }] }),
  component: () => (
    <AppShell title="WhatsApp">
      <PhasePending phase={4} items={["Modelos aprovados pela Meta", "Campanhas e agendamento", "Status de entrega e leitura", "Respostas recebidas"]} />
    </AppShell>
  ),
});
