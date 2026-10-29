import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Painel Admin" }, { name: "description", content: "Conta, segurança e logs." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell title="Configurações">
      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
          <TabsTrigger value="logs">Logs de atividades</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="security"><Security /></TabsContent>
        <TabsContent value="logs"><Logs /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user!;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return { user, profile, roles: (roles ?? []).map((r) => r.role) };
    },
  });
}

function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (me.data?.profile) {
      setName(me.data.profile.full_name ?? "");
      setTz(me.data.profile.timezone);
    }
  }, [me.data]);

  if (me.isLoading) return <Skeleton className="h-48 max-w-lg" />;
  const m = me.data!;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name, timezone: tz }).eq("id", m.user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logActivity("profile.update");
    qc.invalidateQueries({ queryKey: ["me"] });
    toast.success("Perfil atualizado.");
  }

  return (
    <form onSubmit={save} className="max-w-lg space-y-4 rounded-lg border bg-card p-5">
      <div className="text-sm">
        <p className="text-muted-foreground">Usuário</p>
        <p className="font-medium">{m.user.email?.split("@")[0]}</p>
      </div>
      <div className="text-sm">
        <p className="text-muted-foreground">Permissão</p>
        <p className="font-medium">{m.roles.length ? m.roles.join(", ") : "Sem permissão atribuída — peça acesso a um administrador."}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tz">Fuso horário</Label>
        <Input id="tz" value={tz} onChange={(e) => setTz(e.target.value)} />
      </div>
      <Button disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</Button>
    </form>
  );
}

function Security() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: next, current_password: current } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logActivity("auth.password_change");
    setCurrent("");
    setNext("");
    toast.success("Senha alterada.");
  }
  return (
    <form onSubmit={save} className="max-w-lg space-y-4 rounded-lg border bg-card p-5">
      <div className="space-y-2">
        <Label htmlFor="cur">Senha atual</Label>
        <Input id="cur" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">Nova senha</Label>
        <Input id="new" type="password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <Button disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Alterar senha</Button>
    </form>
  );
}

function Logs() {
  const logs = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  if (logs.isLoading) return <Skeleton className="h-48" />;
  if (!logs.data?.length) return <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Nenhuma atividade registrada (visível apenas para administradores).</p>;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Ação</th><th className="px-3 py-2">Usuário</th></tr>
        </thead>
        <tbody className="divide-y">
          {logs.data.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-2 tabular">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
              <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.user_id?.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
