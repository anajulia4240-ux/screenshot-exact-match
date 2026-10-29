import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel Admin" },
      { name: "description", content: "Acesso restrito ao painel de automação de marketing." },
      { property: "og:title", content: "Entrar — Painel Admin" },
      { property: "og:description", content: "Acesso restrito ao painel de automação de marketing." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
    const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Login por usuário: o usuário é convertido em um e-mail interno fixo.
      const user = username.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({ email: `${user}@pulsar.local`, password });
      if (error) throw error;
      await logActivity("auth.login");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(msg === "Invalid login credentials" ? "Usuário ou senha incorretos." : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-sidebar-accent-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold">Painel Admin</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-sidebar-accent-foreground">
            Pedidos, visitantes e campanhas da loja em tempo real.
          </h1>
          <p className="mt-3 text-sm">Acompanhe o funil, a origem dos anúncios e a segurança do site.</p>
        </div>
        <p className="text-xs opacity-60">Acesso restrito a usuários autorizados.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Informe seu usuário e senha.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input id="username" required autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
