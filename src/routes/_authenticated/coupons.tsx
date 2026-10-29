import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Section } from "@/components/admin/common";
import { brl, fmtDateTime } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/coupons")({
  head: () => ({ meta: [{ title: "Cupons — Painel Admin" }, { name: "description", content: "Cupons de desconto com percentual e valor mínimo." }] }),
  component: CouponsPage,
});

const schema = z.object({
  code: z.string().trim().min(2, "Informe o código.").max(30).regex(/^[A-Za-z0-9_-]+$/, "Use só letras, números, - e _."),
  percent: z.number().gt(0, "Percentual deve ser maior que 0.").lte(100, "Percentual máximo é 100."),
  minReais: z.number().min(0, "Valor mínimo inválido."),
});

function CouponsPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [min, setMin] = useState("0");
  const [expires, setExpires] = useState("");
  const list = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["coupons"] });
  const create = useMutation({
    mutationFn: async () => {
      const p = schema.safeParse({ code, percent: Number(percent), minReais: Number(min.replace(",", ".")) });
      if (!p.success) throw new Error(p.error.issues[0].message);
      const { error } = await supabase.from("coupons").insert({
        code: p.data.code.toUpperCase(), percent: p.data.percent, min_value_cents: Math.round(p.data.minReais * 100),
        expires_at: expires ? new Date(`${expires}T23:59:59-03:00`).toISOString() : null,
      });
      if (error) throw new Error(error.code === "23505" ? "Já existe um cupom com esse código." : "Não foi possível criar o cupom.");
    },
    onSuccess: () => { toast.success("Cupom criado."); setCode(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("coupons").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Não foi possível alterar o cupom."),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Não foi possível excluir o cupom."),
  });

  return (
    <AppShell title="Cupons">
      <Section title="Novo cupom">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="space-y-1"><Label htmlFor="code">Código</Label><Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BEMVINDO10" /></div>
          <div className="space-y-1"><Label htmlFor="pct">Desconto (%)</Label><Input id="pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="min">Valor mínimo (R$)</Label><Input id="min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="exp">Expira em</Label><Input id="exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={create.isPending}>Criar cupom</Button></div>
        </form>
      </Section>
      <div className="mt-4">
        {list.isError && <ErrorState />}
        {list.isLoading ? <Skeleton className="h-40" /> : (list.data?.length ?? 0) === 0 ? <EmptyState text="Nenhum cupom criado." /> : (
          <ul className="divide-y rounded-lg border bg-card">
            {list.data!.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-mono font-semibold">{c.code}</span>
                <span>{Number(c.percent)}%</span>
                <span className="text-xs text-muted-foreground">mín. {brl(c.min_value_cents)}{c.expires_at ? ` · expira ${fmtDateTime(c.expires_at)}` : ""}</span>
                <div className="ml-auto flex items-center gap-2">
                  <Switch checked={c.active} onCheckedChange={(active) => toggle.mutate({ id: c.id, active })} aria-label={`Ativar ${c.code}`} />
                  <Button size="icon" variant="ghost" aria-label={`Excluir ${c.code}`} onClick={() => { if (window.confirm(`Excluir o cupom ${c.code}?`)) remove.mutate(c.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
