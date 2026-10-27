import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Inbox,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SegmentBuilder } from "@/components/lists/segment-builder";
import { useLists, useTags } from "@/hooks/use-catalog";
import { logActivity } from "@/lib/audit";
import {
  formatPhone,
  friendlyDbError,
  STATUS_CLASS,
  STATUS_LABEL,
  type Contact,
  type ContactList,
} from "@/lib/contacts";
import {
  applySegment,
  countSegment,
  countStaticList,
  EMPTY_RULES,
  parseRules,
  segmentSelect,
  type SegmentRules,
} from "@/lib/segments";
import { bulkRemoveFromList } from "@/lib/contact-actions";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/lists")({
  head: () => ({
    meta: [
      { title: "Listas e segmentos — Pulsar" },
      { name: "description", content: "Listas estáticas e segmentos dinâmicos de contatos." },
    ],
  }),
  component: ListsPage,
});

type Counts = { total: number; email: number; whatsapp: number };

async function countList(l: ContactList): Promise<Counts> {
  if (l.kind === "segment") {
    const r = parseRules(l.rules);
    const [total, email, whatsapp] = await Promise.all([
      countSegment(r),
      countSegment(r, "email"),
      countSegment(r, "whatsapp"),
    ]);
    return { total, email, whatsapp };
  }
  const [total, email, whatsapp] = await Promise.all([
    countStaticList(l.id),
    countStaticList(l.id, "email"),
    countStaticList(l.id, "whatsapp"),
  ]);
  return { total, email, whatsapp };
}

function ListsPage() {
  const lists = useLists();
  const [editing, setEditing] = useState<ContactList | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<ContactList | null>(null);
  const [deleting, setDeleting] = useState<ContactList | null>(null);
  const qc = useQueryClient();

  const counts = useQuery({
    enabled: !!lists.data,
    queryKey: ["list-counts", lists.data?.map((l) => `${l.id}:${l.updated_at}`)],
    queryFn: async () => {
      const entries = await Promise.all(
        (lists.data ?? []).map(async (l) => [l.id, await countList(l)] as const),
      );
      return Object.fromEntries(entries) as Record<string, Counts>;
    },
  });

  async function remove(l: ContactList) {
    const { error } = await supabase.from("lists").delete().eq("id", l.id);
    if (error) {
      toast.error(friendlyDbError(error));
      return;
    }
    await logActivity("list.delete", { name: l.name }, "list", l.id);
    qc.invalidateQueries({ queryKey: ["lists"] });
    toast.success("Lista excluída. Os contatos continuam cadastrados.");
    setDeleting(null);
  }

  const data = lists.data ?? [];

  return (
    <AppShell
      title="Listas e segmentos"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova lista
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-lg border bg-card p-4">
          <ListPlus className="h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Lista estática</p>
            <p className="text-muted-foreground">
              Você escolhe quem entra: pela importação ou em Contatos → selecionar → Ações em massa
              → Adicionar à lista.
            </p>
          </div>
        </div>
        <div className="flex gap-3 rounded-lg border bg-card p-4">
          <Filter className="h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Segmento</p>
            <p className="text-muted-foreground">
              Definido por regras (tag, status, origem, consentimento…). Atualiza sozinho quando os
              contatos mudam.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Nome</th>
                <th className="p-3 font-medium">Tipo</th>
                <th className="p-3 text-right font-medium">Contatos</th>
                <th
                  className="p-3 text-right font-medium"
                  title="Ativos, com e-mail válido e consentimento"
                >
                  Alcançáveis por e-mail
                </th>
                <th
                  className="p-3 text-right font-medium"
                  title="Ativos, com telefone válido e consentimento"
                >
                  Alcançáveis por WhatsApp
                </th>
                <th className="hidden p-3 font-medium md:table-cell">Atualizada</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lists.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="p-3">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {!lists.isLoading && data.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    <Inbox className="mx-auto mb-2 h-6 w-6" />
                    Nenhuma lista criada.
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> Criar a primeira
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {data.map((l) => {
                const c = counts.data?.[l.id];
                const num = (n: number | undefined) =>
                  counts.isLoading || n === undefined ? (
                    <Skeleton className="ml-auto h-4 w-10" />
                  ) : (
                    n.toLocaleString("pt-BR")
                  );
                return (
                  <tr
                    key={l.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setViewing(l)}
                  >
                    <td className="max-w-[260px] p-3">
                      <p className="truncate font-medium">{l.name}</p>
                      {l.description && (
                        <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${l.kind === "segment" ? "border-primary/30 bg-primary/5 text-primary" : ""}`}
                      >
                        {l.kind === "segment" ? "Segmento" : "Estática"}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular">{num(c?.total)}</td>
                    <td className="p-3 text-right tabular">{num(c?.email)}</td>
                    <td className="p-3 text-right tabular">{num(c?.whatsapp)}</td>
                    <td className="hidden whitespace-nowrap p-3 text-xs text-muted-foreground md:table-cell">
                      {format(new Date(l.updated_at), "dd/MM/yyyy HH:mm")}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="Ações"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(l)}>
                            Ver contatos
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditing(l)}>Editar</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(l)}
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ListDialog
        open={creating || !!editing}
        list={editing}
        onClose={() => (setCreating(false), setEditing(null))}
      />
      <MembersSheet list={viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A lista será apagada. Os contatos continuam cadastrados normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && remove(deleting)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ListDialog({
  open,
  list,
  onClose,
}: {
  open: boolean;
  list: ContactList | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const tags = useTags();
  const lists = useLists();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"static" | "segment">("static");
  const [rules, setRules] = useState<SegmentRules>(EMPTY_RULES);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(list?.name ?? "");
    setDescription(list?.description ?? "");
    setKind((list?.kind as "static" | "segment") ?? "static");
    setRules(list ? parseRules(list.rules) : EMPTY_RULES);
    setPreview(null);
  }, [open, list]);

  // Live count while building a segment
  useEffect(() => {
    if (!open || kind !== "segment") return;
    setPreviewing(true);
    const t = setTimeout(() => {
      countSegment(rules)
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 400);
    return () => clearTimeout(t);
  }, [open, kind, rules]);

  const tagOpts = (tags.data ?? []).map((t) => ({ value: t.id, label: t.name }));
  const listOpts = (lists.data ?? [])
    .filter((l) => l.kind === "static" && l.id !== list?.id)
    .map((l) => ({ value: l.id, label: l.name }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome para a lista.");
      return;
    }
    setSaving(true);
    const row = {
      name: name.trim(),
      description: description.trim() || null,
      kind,
      rules: (kind === "segment" ? rules : {}) as unknown as Json,
    };
    const res = list
      ? await supabase.from("lists").update(row).eq("id", list.id).select("id").single()
      : await supabase.from("lists").insert(row).select("id").single();
    setSaving(false);
    if (res.error) {
      toast.error(friendlyDbError(res.error));
      return;
    }
    await logActivity(
      list ? "list.update" : "list.create",
      { name: row.name, kind },
      "list",
      res.data.id,
    );
    qc.invalidateQueries({ queryKey: ["lists"] });
    toast.success(list ? "Lista atualizada." : "Lista criada.");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{list ? "Editar lista" : "Nova lista"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Ex.: Clientes Gummy 2026"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {!list && (
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as "static" | "segment")}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                className={`flex cursor-pointer gap-2 rounded-md border p-3 text-sm ${kind === "static" ? "border-primary bg-primary/5" : ""}`}
              >
                <RadioGroupItem value="static" className="mt-0.5" />
                <span>
                  <b>Estática</b>
                  <br />
                  <span className="text-muted-foreground">Você adiciona e remove contatos.</span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer gap-2 rounded-md border p-3 text-sm ${kind === "segment" ? "border-primary bg-primary/5" : ""}`}
              >
                <RadioGroupItem value="segment" className="mt-0.5" />
                <span>
                  <b>Segmento</b>
                  <br />
                  <span className="text-muted-foreground">
                    Contatos entram e saem pelas regras.
                  </span>
                </span>
              </label>
            </RadioGroup>
          )}
          {kind === "segment" && (
            <div className="rounded-md border p-3">
              <SegmentBuilder rules={rules} onChange={setRules} tags={tagOpts} lists={listOpts} />
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-primary" />
                {previewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <b>{preview?.toLocaleString("pt-BR") ?? "—"}</b>
                )}{" "}
                contatos atendem às regras agora
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PAGE = 50;

function MembersSheet({ list, onClose }: { list: ContactList | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [list?.id]);

  const q = useQuery({
    enabled: !!list,
    placeholderData: keepPreviousData,
    queryKey: ["list-members", list?.id, list?.updated_at, page],
    queryFn: async () => {
      const l = list!;
      const from = page * PAGE;
      if (l.kind === "segment") {
        const rules = parseRules(l.rules);
        let query = supabase
          .from("contacts")
          .select(segmentSelect(rules, "id,full_name,email,phone,status"), { count: "exact" });
        query = applySegment(query, rules);
        const { data, count, error } = await query
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        return { rows: data as unknown as Contact[], total: count ?? 0 };
      }
      const { data, count, error } = await supabase
        .from("list_members")
        .select("added_at, contacts!inner(id,full_name,email,phone,status)", { count: "exact" })
        .eq("list_id", l.id)
        .order("added_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      return { rows: data.map((m) => m.contacts as unknown as Contact), total: count ?? 0 };
    },
  });

  async function removeMember(id: string) {
    if (!list) return;
    try {
      await bulkRemoveFromList([id], list.id);
      qc.invalidateQueries({ queryKey: ["list-members"] });
      qc.invalidateQueries({ queryKey: ["lists"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    }
  }

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <Sheet open={!!list} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{list?.name}</SheetTitle>
          <SheetDescription>
            {list?.kind === "segment"
              ? "Segmento — prévia dos contatos que atendem às regras agora."
              : "Lista estática."}{" "}
            {total.toLocaleString("pt-BR")} contatos.
          </SheetDescription>
        </SheetHeader>
        {list?.kind === "static" && (
          <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            Para adicionar contatos: vá em{" "}
            <Link to="/contacts" className="text-primary underline">
              Contatos
            </Link>
            , selecione e use "Ações em massa → Adicionar à lista", ou escolha esta lista ao
            importar uma planilha.
          </p>
        )}
        <ul className="mt-3 divide-y rounded-md border text-sm">
          {q.isLoading && (
            <li className="p-3">
              <Skeleton className="h-24" />
            </li>
          )}
          {!q.isLoading && total === 0 && (
            <li className="p-6 text-center text-muted-foreground">Nenhum contato.</li>
          )}
          {(q.data?.rows ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {c.full_name || c.email || formatPhone(c.phone)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[c.email, formatPhone(c.phone)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLASS[c.status]}`}
              >
                {STATUS_LABEL[c.status]}
              </span>
              {list?.kind === "static" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => removeMember(c.id)}
                >
                  Remover
                </Button>
              )}
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            Página {page + 1} de {pages}
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
