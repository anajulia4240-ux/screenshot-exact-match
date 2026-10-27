import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pulsar — Automação de Marketing" },
      { name: "description", content: "Acesse o painel privado de e-mail marketing e WhatsApp." },
      { property: "og:title", content: "Pulsar — Automação de Marketing" },
      { property: "og:description", content: "Painel privado de e-mail marketing e WhatsApp." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  component: () => null,
});
