import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Tags,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { ImportDialog } from "@/components/contacts/import-dialog";
import { TagsDialog } from "@/components/contacts/tags-dialog";
import { ContactDetailSheet } from "@/components/contacts/contact-detail-sheet";
import { useCurrentUser, useLists, useTags } from "@/hooks/use-catalog";
import {
  downloadCsv,
  formatPhone,
  safeSearch,
  STATUS_CLASS,
  STATUS_LABEL,
  STATUSES,
  type Contact,
  type ContactStatus,
} from "@/lib/contacts";
import {
  applyChannel,
  applySegment,
  fetchAllIds,
  segmentSelect,
  type SegmentCondition,
  type SegmentRules,
} from "@/lib/segments";
import {
  bulkAddTag,
  bulkAddToList,
  bulkDelete,
  bulkRemoveFromList,
  bulkRemoveTag,
  bulkSetConsent,
  bulkSetStatus,
} from "@/lib/contact-actions";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contatos — Pulsar" },
      { name: "description", content: "Cadastro, importação e organização de contatos." },
    ],
  }),
  component: ContactsPage,
});

const ALL = "__all__";
type Filters = { search: string; status: string; tag: string; list: string; channel: string };
type Row = Contact & { contact_tags: { tags: { name: string; color: string | null } | null }[] };
type BulkKind =
  "tag_add" | "tag_remove" | "list_add" | "list_remove" | "status" | "consent_on" | "consent_off";

function filtersToRules(f: Filters): SegmentRules {
  const conditions: SegmentCondition[] = [];
  if (f.status !== ALL)
    conditions.push({ field: "status", op: "eq", value: f.status as ContactStatus });
  if (f.tag !== ALL) conditions.push({ field: "tag", op: "has", value: f.tag });
  if (f.list !== ALL) conditions.push({ field: "list", op: "in", value: f.list });
  return { conditions, excludeOptedOut: false };
}

function buildQuery(f: Filters, select: string, opts?: { count?: "exact"; head?: boolean }) {
  const rules = filtersToRules(f);
  let q = supabase.from("contacts").select(segmentSelect(rules, select), opts);
  q = applySegment(q, rules);
  if (f.channel === "email" || f.channel === "whatsapp") q = applyChannel(q, f.channel);
  if (f.channel === "invalid")
    q = q.or(
      "and(email.not.is.null,email_valid.eq.false),and(phone.not.is.null,phone_valid.eq.false)",
    );
  const s = safeSearch(f.search);
  if (s)
    q = q.or(
      `full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s.replace(/\D/g, "") || s}%,company.ilike.%${s}%`,
    );
  return q;
}

function ContactsPage() {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const tags = useTags();
  const lists = useLists();
  const staticLists = (lists.data ?? []).filter((l) => l.kind === "static");

  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: ALL,
    tag: ALL,
    list: ALL,
    channel: ALL,
  });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    setAllMatching(false);
  }, [filters, pageSize]);

  const query = useQuery({
    queryKey: ["contacts", filters, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await buildQuery(
        filters,
        "*, contact_tags(tags(name,color))",
        { count: "exact" },
      )
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      return { rows: data as unknown as Row[], total: count ?? 0 };
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageIds = rows.map((r) => r.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectionCount = allMatching ? total : selected.size;
  const hasFilters =
    filters.search ||
    filters.status !== ALL ||
    filters.tag !== ALL ||
    filters.list !== ALL ||
    filters.channel !== ALL;

  async function selectedIds(): Promise<string[]> {
    if (!allMatching) return [...selected];
    return fetchAllIds(() => buildQuery(filters, "id"));
  }

  function refreshAll() {
    ["contacts", "contact", "lists", "list-counts", "dashboard-stats"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
    setSelected(new Set());
    setAllMatching(false);
  }

  async function runBulk(fn: (ids: string[]) => Promise<void>, msg: string) {
    setWorking(true);
    try {
      const ids = await selectedIds();
      await fn(ids);
      toast.success(`${msg} (${ids.length.toLocaleString("pt-BR")} contatos).`);
      refreshAll();
      setBulk(null);
      setConfirmDelete(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar a ação.");
    } finally {
      setWorking(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all: Contact[] = [];
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await buildQuery(filters, "*")
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        all.push(...(data as unknown as Contact[]));
        if (data.length < 1000) break;
      }
      downloadCsv(`contatos-${format(new Date(), "yyyy-MM-dd")}.csv`, [
        [
          "Nome",
          "E-mail",
          "E-mail válido",
          "Telefone",
          "Telefone válido",
          "Empresa",
          "Origem",
          "Status",
          "Aceita e-mail",
          "Aceita WhatsApp",
          "Cadastrado em",
        ],
        ...all.map((c) => [
          c.full_name,
          c.email,
          c.email_valid ? "sim" : "não",
          c.phone,
          c.phone_valid ? "sim" : "não",
          c.company,
          c.source,
          STATUS_LABEL[c.status],
          c.allow_email ? "sim" : "não",
          c.allow_whatsapp ? "sim" : "não",
          format(new Date(c.created_at), "dd/MM/yyyy"),
        ]),
      ]);
      await logActivity("contacts.export", { count: all.length });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar.");
    } finally {
      setExporting(false);
    }
  }

  const actions = (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setTagsOpen(true)}
        className="hidden sm:inline-flex"
      >
        <Tags className="mr-1.5 h-4 w-4" /> Tags
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={exportCsv}
        disabled={exporting || total === 0}
        className="hidden sm:inline-flex"
      >
        {exporting ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" />
        )}{" "}
        Exportar
      </Button>
      <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
        <Upload className="mr-1.5 h-4 w-4" /> Importar
      </Button>
      <Button
        size="sm"
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Novo
      </Button>
    </>
  );

  return (
    <AppShell title="Contatos" actions={actions}>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome, e-mail, telefone ou empresa"
            className="pl-8"
          />
        </div>
        <FilterSelect
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          placeholder="Status"
          options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <FilterSelect
          value={filters.tag}
          onChange={(v) => setFilters((f) => ({ ...f, tag: v }))}
          placeholder="Tag"
          options={(tags.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
        <FilterSelect
          value={filters.list}
          onChange={(v) => setFilters((f) => ({ ...f, list: v }))}
          placeholder="Lista"
          options={staticLists.map((l) => ({ value: l.id, label: l.name }))}
        />
        <FilterSelect
          value={filters.channel}
          onChange={(v) => setFilters((f) => ({ ...f, channel: v }))}
          placeholder="Canal"
          options={[
            { value: "email", label: "Pode receber e-mail" },
            { value: "whatsapp", label: "Pode receber WhatsApp" },
            { value: "invalid", label: "Dados fora do padrão" },
          ]}
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setSearchInput("");
              setFilters({ search: "", status: ALL, tag: ALL, list: ALL, channel: ALL });
            }}
          >
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        )}
      </div>

      {selectionCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selectionCount.toLocaleString("pt-BR")} selecionados</span>
          {!allMatching && pageAllSelected && total > pageIds.length && (
            <button
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => setAllMatching(true)}
            >
              Selecionar todos os {total.toLocaleString("pt-BR")} resultados
            </button>
          )}
          <button
            className="text-muted-foreground hover:underline"
            onClick={() => {
              setSelected(new Set());
              setAllMatching(false);
            }}
          >
            Limpar seleção
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="ml-auto" disabled={working}>
                {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Ações em massa
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Organizar</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setBulk("tag_add")}>Adicionar tag</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulk("tag_remove")}>Remover tag</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulk("list_add")}>
                Adicionar à lista
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulk("list_remove")}>
                Remover da lista
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Status e consentimento</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setBulk("status")}>Alterar status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulk("consent_on")}>
                Registrar consentimento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulk("consent_off")}>
                Remover consentimento
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 p-3">
                  <Checkbox
                    aria-label="Selecionar página"
                    checked={pageAllSelected}
                    onCheckedChange={(v) => {
                      setAllMatching(false);
                      setSelected((s) => {
                        const n = new Set(s);
                        pageIds.forEach((id) => (v ? n.add(id) : n.delete(id)));
                        return n;
                      });
                    }}
                  />
                </th>
                <th className="p-3 font-medium">Nome</th>
                <th className="p-3 font-medium">E-mail</th>
                <th className="p-3 font-medium">Telefone</th>
                <th className="hidden p-3 font-medium md:table-cell">Tags</th>
                <th className="p-3 font-medium">Status</th>
                <th className="hidden p-3 font-medium lg:table-cell">Canais</th>
                <th className="hidden p-3 font-medium xl:table-cell">Cadastro</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {query.isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="p-3">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    <Inbox className="mx-auto mb-2 h-6 w-6" />
                    {hasFilters
                      ? "Nenhum contato encontrado com esses filtros."
                      : "Nenhum contato ainda. Importe uma planilha ou cadastre o primeiro."}
                    {!hasFilters && (
                      <div className="mt-3 flex justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                          <Upload className="mr-1.5 h-4 w-4" /> Importar planilha
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className={`cursor-pointer hover:bg-muted/30 ${selected.has(c.id) || allMatching ? "bg-primary/5" : ""}`}
                  onClick={() => setDetailId(c.id)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label="Selecionar contato"
                      checked={allMatching || selected.has(c.id)}
                      onCheckedChange={(v) => {
                        setAllMatching(false);
                        setSelected((s) => {
                          const n = new Set(allMatching ? pageIds : s);
                          if (v) n.add(c.id);
                          else n.delete(c.id);
                          return n;
                        });
                      }}
                    />
                  </td>
                  <td className="max-w-[200px] p-3">
                    <p className="truncate font-medium">{c.full_name || "—"}</p>
                    {c.company && (
                      <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                    )}
                  </td>
                  <td
                    className={`max-w-[220px] truncate p-3 ${c.email && !c.email_valid ? "text-amber-600" : ""}`}
                  >
                    {c.email ?? "—"}
                  </td>
                  <td
                    className={`whitespace-nowrap p-3 ${c.phone && !c.phone_valid ? "text-amber-600" : ""}`}
                  >
                    {formatPhone(c.phone) || "—"}
                  </td>
                  <td className="hidden p-3 md:table-cell">
                    <div className="flex max-w-[200px] flex-wrap gap-1">
                      {c.contact_tags.slice(0, 3).map(
                        (ct, i) =>
                          ct.tags && (
                            <span
                              key={i}
                              className="rounded-full px-1.5 py-0.5 text-[11px] text-white"
                              style={{ backgroundColor: ct.tags.color ?? "#2563eb" }}
                            >
                              {ct.tags.name}
                            </span>
                          ),
                      )}
                      {c.contact_tags.length > 3 && (
                        <span className="text-[11px] text-muted-foreground">
                          +{c.contact_tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap p-3 text-xs lg:table-cell">
                    <span
                      className={
                        c.allow_email ? "text-foreground" : "text-muted-foreground line-through"
                      }
                    >
                      E-mail
                    </span>
                    {" · "}
                    <span
                      className={
                        c.allow_whatsapp ? "text-foreground" : "text-muted-foreground line-through"
                      }
                    >
                      WhatsApp
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap p-3 text-xs text-muted-foreground xl:table-cell">
                    {format(new Date(c.created_at), "dd/MM/yyyy")}
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Ações">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailId(c.id)}>
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setAllMatching(false);
                            setSelected(new Set([c.id]));
                            setConfirmDelete(true);
                          }}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>
            {total.toLocaleString("pt-BR")} contatos
            {query.isFetching && !query.isLoading && " · atualizando…"}
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} por página
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              Página {page + 1} de {pages}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} contact={editing} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} />
      <ContactDetailSheet
        contactId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(c) => {
          setEditing(c);
          setFormOpen(true);
        }}
      />

      <BulkDialog
        kind={bulk}
        count={selectionCount}
        working={working}
        tags={(tags.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
        lists={staticLists.map((l) => ({ value: l.id, label: l.name }))}
        onClose={() => setBulk(null)}
        onConfirm={(kind, value, extra) => {
          const uid = me.data?.id;
          const map: Record<BulkKind, [(ids: string[]) => Promise<void>, string]> = {
            tag_add: [(ids) => bulkAddTag(ids, value), "Tag adicionada"],
            tag_remove: [(ids) => bulkRemoveTag(ids, value), "Tag removida"],
            list_add: [(ids) => bulkAddToList(ids, value), "Adicionados à lista"],
            list_remove: [(ids) => bulkRemoveFromList(ids, value), "Removidos da lista"],
            status: [(ids) => bulkSetStatus(ids, value as ContactStatus, uid), "Status alterado"],
            consent_on: [
              (ids) => bulkSetConsent(ids, value as "email" | "whatsapp", true, extra),
              "Consentimento registrado",
            ],
            consent_off: [
              (ids) => bulkSetConsent(ids, value as "email" | "whatsapp", false, ""),
              "Consentimento removido",
            ],
          };
          const [fn, msg] = map[kind];
          runBulk(fn, msg);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={(v) => !working && setConfirmDelete(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectionCount.toLocaleString("pt-BR")} contato(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os contatos e o histórico de envios deles serão apagados para sempre. Se a intenção é
              só parar de enviar mensagens, prefira mudar o status para "Descadastrado" ou
              "Bloqueado".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={working}
              onClick={(e) => {
                e.preventDefault();
                runBulk(bulkDelete, "Contatos excluídos");
              }}
            >
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`h-9 w-auto min-w-[120px] ${value !== ALL ? "border-primary text-primary" : ""}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const BULK_TITLE: Record<BulkKind, string> = {
  tag_add: "Adicionar tag",
  tag_remove: "Remover tag",
  list_add: "Adicionar à lista",
  list_remove: "Remover da lista",
  status: "Alterar status",
  consent_on: "Registrar consentimento",
  consent_off: "Remover consentimento",
};

function BulkDialog({
  kind,
  count,
  working,
  tags,
  lists,
  onClose,
  onConfirm,
}: {
  kind: BulkKind | null;
  count: number;
  working: boolean;
  tags: { value: string; label: string }[];
  lists: { value: string; label: string }[];
  onClose: () => void;
  onConfirm: (kind: BulkKind, value: string, extra: string) => void;
}) {
  const [value, setValue] = useState("");
  const [extra, setExtra] = useState("");
  useEffect(() => {
    setValue("");
    setExtra("");
  }, [kind]);

  const options = useMemo(() => {
    if (!kind) return [];
    if (kind.startsWith("tag")) return tags;
    if (kind.startsWith("list")) return lists;
    if (kind === "status") return STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
    return [
      { value: "email", label: "E-mail" },
      { value: "whatsapp", label: "WhatsApp" },
    ];
  }, [kind, tags, lists]);

  const needsExtra = kind === "consent_on";
  const empty = options.length === 0;

  return (
    <Dialog open={!!kind} onOpenChange={(v) => !v && !working && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind && BULK_TITLE[kind]} · {count.toLocaleString("pt-BR")} contatos
          </DialogTitle>
        </DialogHeader>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            {kind?.startsWith("tag")
              ? "Nenhuma tag criada ainda."
              : "Nenhuma lista estática criada ainda. Crie em Listas e segmentos."}
          </p>
        ) : (
          <div className="grid gap-3">
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsExtra && (
              <Input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Como o consentimento foi obtido?"
              />
            )}
            {kind === "status" && ["unsubscribed", "blocked", "bounced"].includes(value) && (
              <p className="text-xs text-muted-foreground">
                Esses contatos também entram na lista de bloqueio e não receberão campanhas.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={working}>
            Cancelar
          </Button>
          <Button
            disabled={!value || working || (needsExtra && !extra.trim())}
            onClick={() => kind && onConfirm(kind, value, extra.trim())}
          >
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
