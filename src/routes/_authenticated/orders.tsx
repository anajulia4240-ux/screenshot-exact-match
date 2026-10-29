import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, Flag } from "@/components/admin/common";
import { brl, extractAdsInfo, fmtDateTime } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "Pedidos — Painel Admin" }, { name: "description", content: "Lista, edição e confirmação de pedidos." }] }),
  component: OrdersPage,
});

type Order = Tables<"orders">;
const STATUS = { pending: { l: "Pendente", t: "warn" }, paid: { l: "Pago", t: "ok" }, cancelled: { l: "Cancelado", t: "muted" }, refunded: { l: "Reembolsado", t: "danger" } } as const;
type St = keyof typeof STATUS;

function OrdersPage() {
  const [filter, setFilter] = useState<"all" | St>("all");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Order | null>(null);
  const q = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const rows = (q.data ?? []).filter((o) => (filter === "all" || o.status === filter) &&
    [o.customer_name, o.customer_phone, o.customer_email].join(" ").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <AppShell title="Pedidos">
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar pedido" />
        {(["all", "pending", "paid", "cancelled", "refunded"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "all" ? "Todos" : STATUS[f].l}</Button>
        ))}
      </div>
      {q.isError && <ErrorState />}
      {q.isLoading ? <Skeleton className="h-64" /> : rows.length === 0 ? <EmptyState text="Nenhum pedido encontrado." /> : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Origem</TableHead><TableHead className="hidden sm:table-cell">Criado</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((o) => {
                const ads = extractAdsInfo(o.tracking);
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setSel(o)}>
                    <TableCell className="font-medium">{o.customer_name ?? "—"}<div className="text-xs font-normal text-muted-foreground">{o.customer_phone}</div></TableCell>
                    <TableCell className="tabular">{brl(o.total_cents)}</TableCell>
                    <TableCell><Flag tone={STATUS[o.status as St].t}>{STATUS[o.status as St].l}</Flag></TableCell>
                    <TableCell className="hidden text-xs md:table-cell">{[ads.campaign, ads.adset, ads.ad].filter(Boolean).join(" • ") || "Origem desconhecida"}</TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">{fmtDateTime(o.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {sel && <OrderDialog order={sel} onClose={() => setSel(null)} />}
    </AppShell>
  );
}

function OrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(order.customer_name ?? "");
  const [phone, setPhone] = useState(order.customer_phone ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const save = useMutation({
    mutationFn: async (patch: Partial<Order>) => {
      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pedido atualizado."); qc.invalidateQueries({ queryKey: ["orders"] }); onClose(); },
    onError: () => toast.error("Não foi possível salvar o pedido."),
  });
  const items = Array.isArray(order.items) ? (order.items as { name?: string; qty?: number }[]) : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Pedido de {order.customer_name ?? "cliente"} — {brl(order.total_cents)}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" aria-label="Telefone" />
          </div>
          {items.length > 0 && <ul className="rounded-md bg-muted p-2 text-xs">{items.map((i, k) => <li key={k}>{i.name} — {i.qty ?? 1} un.</li>)}</ul>}
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" aria-label="Observações" />
          <p className="text-xs text-muted-foreground">Status: {STATUS[order.status as St].l}{order.confirmed_by ? ` (confirmado ${order.confirmed_by === "manual" ? "manualmente" : "pelo gateway"})` : ""}</p>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {order.status === "pending" && (
              <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ status: "paid", confirmed_by: "manual", paid_at: new Date().toISOString() })}>Confirmar pagamento manual</Button>
            )}
            {order.status !== "cancelled" && order.status !== "paid" && (
              <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ status: "cancelled" })}>Cancelar</Button>
            )}
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate({ customer_name: name || null, customer_phone: phone || null, notes: notes || null })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
