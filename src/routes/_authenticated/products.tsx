import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AddProductPanel } from "@/components/admin/add-product-panel";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Adicionar produto — Painel Admin" },
      { name: "description", content: "Cadastre, edite, pause e exclua produtos da loja." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <AppShell title="Adicionar produto">
      <AddProductPanel />
    </AppShell>
  );
}
