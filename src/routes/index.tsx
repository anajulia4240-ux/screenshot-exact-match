import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel Admin — Loja" },
      { name: "description", content: "Acesse o painel privado da loja." },
      { property: "og:title", content: "Painel Admin — Loja" },
      { property: "og:description", content: "Painel privado da loja." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  component: () => null,
});
