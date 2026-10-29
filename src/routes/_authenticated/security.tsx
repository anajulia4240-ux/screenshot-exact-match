import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Flag, Section } from "@/components/admin/common";
import { fmtDateTime } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "Segurança — Painel Admin" }, { name: "description", content: "IPs banidos e log de ataques." }] }),
  component: SecurityPage,
});

const SEV: Record<string, "muted" | "warn" | "danger"> = { low: "muted", medium: "warn", high: "danger", critical: "danger" };

function SecurityPage() {
  const qc = useQueryClient();
  const banned = useQuery({
    queryKey: ["banned-ips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banned_ips").select("*").order("last_attack_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const attacks = useQuery({
    queryKey: ["attack-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attack_log").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const act = useMutation({
    mutationFn: async ({ ip, kind }: { ip: string; kind: "unban" | "review" }) => {
      if (kind === "review") {
        const { error } = await supabase.from("banned_ips").update({ reviewed: true }).eq("ip", ip);
        if (error) throw error;
        return;
      }
      const a = await supabase.from("banned_ips").update({ unbanned: true }).eq("ip", ip);
      if (a.error) throw a.error;
      const b = await supabase.from("visitor_ips").update({ blocked: false, permanent_block: false }).eq("ip", ip);
      if (b.error) throw b.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["banned-ips"] }); qc.invalidateQueries({ queryKey: ["visitor-ips"] }); },
    onError: () => toast.error("Não foi possível concluir a ação."),
  });

  return (
    <AppShell title="Segurança">
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="IPs banidos">
          {banned.isError && <ErrorState />}
          {banned.isLoading ? <Skeleton className="h-48" /> : (banned.data?.length ?? 0) === 0 ? <EmptyState text="Nenhum IP banido." /> : (
            <ul className="divide-y text-sm">
              {banned.data!.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold">{b.ip} {b.unbanned ? <Flag tone="ok">Desbanido</Flag> : <Flag tone={SEV[b.severity ?? "medium"] ?? "warn"}>{b.severity}</Flag>} {b.reviewed && <Flag>Revisado</Flag>}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.reason} · {b.attack_count} ataque(s) · {fmtDateTime(b.last_attack_at)}</p>
                  </div>
                  {!b.reviewed && <Button size="sm" variant="ghost" onClick={() => act.mutate({ ip: b.ip, kind: "review" })}>Revisado</Button>}
                  {!b.unbanned && <Button size="sm" variant="outline" onClick={() => act.mutate({ ip: b.ip, kind: "unban" })}>Desbanir</Button>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Log de ataques (últimos 200)">
          {attacks.isError && <ErrorState />}
          {attacks.isLoading ? <Skeleton className="h-48" /> : (attacks.data?.length ?? 0) === 0 ? <EmptyState text="Nenhuma tentativa registrada." /> : (
            <ul className="divide-y text-sm">
              {attacks.data!.map((a) => (
                <li key={a.id} className="py-2.5">
                  <p className="flex flex-wrap items-center gap-2"><Flag tone={SEV[a.severity] ?? "warn"}>{a.attack_type}</Flag><span className="font-mono text-xs">{a.ip}</span><span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span></p>
                  {a.payload_preview && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{a.method} {a.url} — {a.payload_preview}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
