import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Flag as FlagIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Flag } from "@/components/admin/common";
import { fmtDateTime } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — Painel Admin" }, { name: "description", content: "Nomes, telefones e cliques no WhatsApp capturados." }] }),
  component: LogsPage,
});

type Filter = "all" | "suspicious" | "whatsapp_click" | "name_submit";
const FILTERS: [Filter, string][] = [["all", "Todos"], ["suspicious", "Suspeitos"], ["whatsapp_click", "Cliques WhatsApp"], ["name_submit", "Envios de nome"]];

function LogsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("logs").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const mark = useMutation({
    mutationFn: async ({ id, suspicious }: { id: string; suspicious: boolean }) => {
      const { error } = await supabase.from("logs").update({ suspicious }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
    onError: () => toast.error("Não foi possível marcar o registro."),
  });
  const rows = (q.data ?? []).filter((l) => filter === "all" || (filter === "suspicious" ? l.suspicious : l.action === filter));

  return (
    <AppShell title="Logs">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([f, label]) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{label}</Button>)}
      </div>
      {q.isError && <ErrorState />}
      {q.isLoading ? <Skeleton className="h-64" /> : rows.length === 0 ? <EmptyState text="Nenhum registro." /> : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <Flag tone={l.suspicious ? "danger" : "muted"}>{l.action}</Flag>
              <span className="font-medium">{l.name ?? "—"}</span>
              <span className="text-muted-foreground">{l.phone ?? ""}</span>
              <span className="font-mono text-xs text-muted-foreground">{l.ip}</span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(l.created_at)}</span>
              <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label={l.suspicious ? "Remover marca de suspeito" : "Marcar como suspeito"} onClick={() => mark.mutate({ id: l.id, suspicious: !l.suspicious })}>
                <FlagIcon className={l.suspicious ? "h-4 w-4 text-destructive" : "h-4 w-4"} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
