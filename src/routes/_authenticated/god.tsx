import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Section } from "@/components/admin/common";
import { timeAgo } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/god")({
  head: () => ({ meta: [{ title: "Modo Deus — Painel Admin" }, { name: "description", content: "Sessões ao vivo, trava de tela e chat com o visitante." }] }),
  component: GodPage,
});

type GodSession = Tables<"god_sessions">;
const ONLINE_MS = 120_000;

function GodPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [, setTick] = useState(0);
  const sessions = useQuery({
    queryKey: ["god-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("god_sessions").select("*")
        .gte("last_seen_at", new Date(Date.now() - 7 * 86400_000).toISOString()).order("last_seen_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase.channel(`god_admin_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "god_sessions" }, () => qc.invalidateQueries({ queryKey: ["god-sessions"] }))
      .subscribe();
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, [qc]);

  const rows = (sessions.data ?? []).filter((s) => [s.name, s.phone, s.current_page, s.ip].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const current = rows.find((s) => s.session_id === selected) ?? null;

  return (
    <AppShell title="Modo Deus">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Section title="Sessões (7 dias)">
          <Input className="mb-3" placeholder="Buscar nome, telefone, página ou IP" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar sessão" />
          {sessions.isError && <ErrorState />}
          {sessions.isLoading ? <Skeleton className="h-64" /> : rows.length === 0 ? <EmptyState text="Nenhuma sessão ainda. Elas aparecem quando o site da loja começar a enviar o sinal de presença." /> : (
            <ul className="max-h-[60vh] divide-y overflow-y-auto text-sm">
              {rows.map((s) => {
                const online = Date.now() - +new Date(s.last_seen_at) < ONLINE_MS;
                return (
                  <li key={s.id}>
                    <button onClick={() => setSelected(s.session_id)} className={cn("flex w-full items-center gap-2 px-1 py-2.5 text-left hover:bg-muted", selected === s.session_id && "bg-muted")}>
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", online ? "bg-chart-2" : "bg-muted-foreground/40")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name ?? "Anônimo"} {s.phone && <span className="font-normal text-muted-foreground">· {s.phone}</span>}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{s.current_page ?? "/"}</span>
                      </span>
                      {s.locked && <Lock className="h-3.5 w-3.5 text-destructive" />}
                      <span className="text-xs text-muted-foreground">{timeAgo(s.last_seen_at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        {current ? <SessionPanel key={current.session_id} s={current} /> : <Section title="Controle"><EmptyState text="Selecione uma sessão para travar a tela ou conversar." /></Section>}
      </div>
    </AppShell>
  );
}

function SessionPanel({ s }: { s: GodSession }) {
  const qc = useQueryClient();
  const [notice, setNotice] = useState(s.admin_message ?? "");
  const [text, setText] = useState("");
  const msgs = useQuery({
    queryKey: ["god-messages", s.session_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("god_messages").select("*").eq("session_id", s.session_id).order("created_at").limit(500);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase.channel(`god_chat_${s.session_id}_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "god_messages", filter: `session_id=eq.${s.session_id}` },
        () => qc.invalidateQueries({ queryKey: ["god-messages", s.session_id] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [s.session_id, qc]);

  async function update(patch: Partial<GodSession>) {
    const { error } = await supabase.from("god_sessions").update({ ...patch, updated_at: new Date().toISOString() }).eq("session_id", s.session_id);
    if (error) toast.error("Não foi possível atualizar a sessão.");
    else qc.invalidateQueries({ queryKey: ["god-sessions"] });
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const { error } = await supabase.from("god_messages").insert({ session_id: s.session_id, sender: "admin", text: t });
    if (error) return void toast.error("Mensagem não enviada.");
    setText("");
    qc.invalidateQueries({ queryKey: ["god-messages", s.session_id] });
  }

  return (
    <Section title={`${s.name ?? "Anônimo"} — ${s.ip ?? "IP desconhecido"}`}>
      <div className="flex items-center justify-between rounded-md border p-3">
        <div><p className="text-sm font-medium">Travar tela do visitante</p><p className="text-xs text-muted-foreground">Abre o atendimento ao vivo sobre o site.</p></div>
        <Switch checked={s.locked} onCheckedChange={(locked) => update({ locked })} aria-label="Travar tela" />
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="Aviso no topo (opcional)" aria-label="Aviso no topo" />
        <Button variant="outline" onClick={() => update({ admin_message: notice.trim() || null })}>Salvar aviso</Button>
      </div>
      <div className="mt-4 h-64 space-y-2 overflow-y-auto rounded-md bg-muted/50 p-3">
        {msgs.isLoading ? <Skeleton className="h-full" /> : (msgs.data?.length ?? 0) === 0 ? <p className="text-center text-xs text-muted-foreground">Sem mensagens.</p> :
          msgs.data!.map((m) => (
            <div key={m.id} className={cn("max-w-[80%] rounded-lg px-3 py-1.5 text-sm", m.sender === "admin" ? "bg-card" : "ml-auto bg-primary text-primary-foreground")}>{m.text}</div>
          ))}
      </div>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem" aria-label="Mensagem" />
        <Button type="submit" size="icon" aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">O espelhamento da tela do visitante será ligado quando o site da loja estiver conectado.</p>
    </Section>
  );
}
