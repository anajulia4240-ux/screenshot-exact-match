import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Pulsar" }, { name: "description", content: "Indicadores de contatos e campanhas." }] }),
  component: Dashboard,
});

type Stats = Record<
  "contacts_total" | "contacts_active" | "contacts_email_valid" | "contacts_phone_valid" | "campaigns_total" | "campaigns_running" | "sent" | "delivered" | "failed" | "opened" | "clicked" | "replies",
  number
>;

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const activity = useQuery({
    queryKey: ["daily-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("daily_activity", { _days: 30 });
      if (error) throw error;
      const map = new Map<string, { day: string; email: number; whatsapp: number }>();
      for (const r of data ?? []) {
        const k = r.day as string;
        const row = map.get(k) ?? { day: k.slice(5), email: 0, whatsapp: 0 };
        row[r.channel as "email" | "whatsapp"] += Number(r.sent);
        map.set(k, row);
      }
      return [...map.values()];
    },
  });
  const campaigns = useQuery({
    queryKey: ["recent-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("id,name,channel,status,created_at").order("created_at", { ascending: false }).limit(6);
      if (error) throw error;
      return data;
    },
  });

  const s = stats.data;
  const cards: { label: string; value: string; hint?: string }[] = s
    ? [
        { label: "Contatos", value: s.contacts_total.toLocaleString("pt-BR"), hint: `${s.contacts_active.toLocaleString("pt-BR")} ativos` },
        { label: "E-mails válidos", value: s.contacts_email_valid.toLocaleString("pt-BR") },
        { label: "Telefones válidos", value: s.contacts_phone_valid.toLocaleString("pt-BR") },
        { label: "Campanhas", value: s.campaigns_total.toLocaleString("pt-BR"), hint: `${s.campaigns_running} em andamento` },
        { label: "Aceitos pelo provedor", value: s.sent.toLocaleString("pt-BR") },
        { label: "Entregas confirmadas", value: s.delivered.toLocaleString("pt-BR"), hint: `Taxa ${pct(s.delivered, s.sent)}` },
        { label: "Falhas", value: s.failed.toLocaleString("pt-BR") },
        { label: "Aberturas / cliques", value: `${s.opened} / ${s.clicked}`, hint: `Abertura ${pct(s.opened, s.delivered)}` },
        { label: "Respostas WhatsApp", value: s.replies.toLocaleString("pt-BR") },
      ]
    : [];

  return (
    <AppShell title="Dashboard">
      {stats.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> Não foi possível carregar os indicadores. Verifique se sua conta tem permissão de acesso.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.isLoading
          ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-[88px]" />)
          : cards.map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular">{c.value}</p>
                {c.hint && <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>}
              </div>
            ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Envios aceitos — últimos 30 dias</h2>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-1" />E-mail</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-2" />WhatsApp</span>
            </div>
          </div>
          {activity.isLoading ? (
            <Skeleton className="h-56" />
          ) : (activity.data?.length ?? 0) === 0 ? (
            <Empty text="Nenhum envio registrado no período. Os dados aparecerão após as primeiras campanhas." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={activity.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--color-muted-foreground)" allowDecimals={false} />
                  <Tooltip />
                  <Area dataKey="email" name="E-mail" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.15} />
                  <Area dataKey="whatsapp" name="WhatsApp" stroke="var(--color-chart-2)" fill="var(--color-chart-2)" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Campanhas recentes</h2>
          {campaigns.isLoading ? (
            <Skeleton className="h-56" />
          ) : (campaigns.data?.length ?? 0) === 0 ? (
            <Empty text="Nenhuma campanha criada.">
              <Button asChild size="sm" variant="outline" className="mt-3"><Link to="/campaigns">Ir para campanhas</Link></Button>
            </Empty>
          ) : (
            <ul className="divide-y text-sm">
              {campaigns.data!.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.channel === "email" ? "E-mail" : "WhatsApp"} · {c.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <Inbox className="mb-2 h-6 w-6" />
      <p className="max-w-xs">{text}</p>
      {children}
    </div>
  );
}
