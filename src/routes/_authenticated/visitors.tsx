import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, Flag } from "@/components/admin/common";
import { blockIp, unblockIp } from "@/lib/blocking";
import { timeAgo } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/visitors")({
  head: () => ({ meta: [{ title: "Visitantes (IPs) — Painel Admin" }, { name: "description", content: "IPs capturados no primeiro acesso, geolocalização e bloqueio." }] }),
  component: VisitorsPage,
});

type Filter = "all" | "active" | "blocked";

function VisitorsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["visitor-ips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visitor_ips").select("*").order("last_seen_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ ip, blocked }: { ip: string; blocked: boolean }) => (blocked ? unblockIp(ip) : blockIp(ip, "Bloqueio manual pelo painel")),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visitor-ips"] }); qc.invalidateQueries({ queryKey: ["banned-ips"] }); toast.success("Bloqueio atualizado."); },
    onError: () => toast.error("Não foi possível alterar o bloqueio."),
  });
  const rows = (q.data ?? []).filter((v) =>
    (filter === "all" || (filter === "blocked" ? v.blocked : !v.blocked)) &&
    [v.ip, v.name, v.geo_city, v.geo_country].join(" ").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <AppShell title="Visitantes (IPs)">
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar IP, nome ou cidade" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar visitante" />
        {(["all", "active", "blocked"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{{ all: "Todos", active: "Ativos", blocked: "Bloqueados" }[f]}</Button>
        ))}
      </div>
      {q.isError && <ErrorState />}
      {q.isLoading ? <Skeleton className="h-64" /> : rows.length === 0 ? <EmptyState text="Nenhum IP registrado ainda. Eles aparecem no primeiro acesso de cada visitante ao site da loja." /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>IP</TableHead><TableHead>Nome</TableHead><TableHead>Local</TableHead><TableHead>Visitas</TableHead><TableHead>Última página</TableHead><TableHead>Sinais</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.ip}<div className="text-muted-foreground">{timeAgo(v.last_seen_at)} atrás</div></TableCell>
                  <TableCell>{v.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{[v.geo_city, v.geo_country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="tabular">{v.visit_count}</TableCell>
                  <TableCell className="max-w-[160px] truncate font-mono text-xs">{v.last_page ?? "—"}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">
                    {v.is_vpn && <Flag tone="warn">VPN</Flag>}{v.is_proxy && <Flag tone="warn">Proxy</Flag>}{v.is_tor && <Flag tone="danger">Tor</Flag>}
                    {v.is_datacenter && <Flag tone="warn">Datacenter</Flag>}{v.tz_mismatch && <Flag tone="warn">TZ</Flag>}{v.is_virtual && <Flag tone="danger">Bot</Flag>}
                    {v.blocked && <Flag tone="danger">Bloqueado</Flag>}
                  </div></TableCell>
                  <TableCell><Button size="sm" variant={v.blocked ? "outline" : "ghost"} disabled={toggle.isPending} onClick={() => toggle.mutate({ ip: v.ip, blocked: v.blocked })}>{v.blocked ? "Desbloquear" : "Bloquear"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
