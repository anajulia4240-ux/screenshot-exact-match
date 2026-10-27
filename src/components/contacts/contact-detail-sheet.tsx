import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, Check, Mail, MessageCircle, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, STATUS_CLASS, STATUS_LABEL, type Contact } from "@/lib/contacts";

const fmt = (d: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

const DELIVERY_LABEL: Record<string, string> = {
  pending: "Na fila",
  excluded: "Excluído",
  sending: "Enviando",
  accepted: "Aceito pelo provedor",
  delivered: "Entregue",
  opened: "Aberto",
  clicked: "Clicado",
  read: "Lido",
  replied: "Respondeu",
  bounced: "Rejeitado",
  failed: "Falhou",
};

const ACTION_LABEL: Record<string, string> = {
  "contact.create": "Contato criado",
  "contact.update": "Contato editado",
};

export function ContactDetailSheet({
  contactId,
  onClose,
  onEdit,
}: {
  contactId: string | null;
  onClose: () => void;
  onEdit: (c: Contact) => void;
}) {
  const q = useQuery({
    enabled: !!contactId,
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const id = contactId!;
      const [c, tags, lists, sends, events, logs, supp] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).single(),
        supabase.from("contact_tags").select("tags(id,name,color)").eq("contact_id", id),
        supabase.from("list_members").select("added_at, lists(id,name)").eq("contact_id", id),
        supabase
          .from("campaign_recipients")
          .select(
            "id,status,channel,sent_at,delivered_at,opened_at,clicked_at,last_error,created_at, campaigns(name)",
          )
          .eq("contact_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("message_events")
          .select("id,event_type,channel,occurred_at")
          .eq("contact_id", id)
          .order("occurred_at", { ascending: false })
          .limit(30),
        supabase
          .from("audit_logs")
          .select("id,action,created_at")
          .eq("entity", "contact")
          .eq("entity_id", id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("suppressions").select("id,reason,created_at").eq("contact_id", id),
      ]);
      if (c.error) throw c.error;
      return {
        contact: c.data,
        tags: (tags.data ?? []).map((t) => t.tags).filter(Boolean) as {
          id: string;
          name: string;
          color: string | null;
        }[],
        lists: (lists.data ?? []).filter((l) => l.lists) as {
          added_at: string;
          lists: { id: string; name: string };
        }[],
        sends: sends.data ?? [],
        events: events.data ?? [],
        logs: logs.data ?? [],
        suppressions: supp.data ?? [],
      };
    },
  });

  const d = q.data;
  const c = d?.contact;

  return (
    <Sheet open={!!contactId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {c?.full_name || c?.email || formatPhone(c?.phone ?? null) || "Contato"}
          </SheetTitle>
        </SheetHeader>
        {q.isLoading || !c || !d ? (
          <div className="mt-4 grid gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="mt-4 grid gap-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[c.status]}`}>
                {STATUS_LABEL[c.status]}
              </span>
              {d.suppressions.length > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                  <Ban className="h-3 w-3" /> Na lista de bloqueio
                </span>
              )}
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => onEdit(c)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
              </Button>
            </div>

            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="flex items-center gap-1.5 break-all">
                {c.email ?? "—"} {c.email && <Valid ok={c.email_valid} />}
              </dd>
              <dt className="text-muted-foreground">Telefone</dt>
              <dd className="flex items-center gap-1.5">
                {formatPhone(c.phone) || "—"} {c.phone && <Valid ok={c.phone_valid} />}
              </dd>
              <dt className="text-muted-foreground">Empresa</dt>
              <dd>{c.company ?? "—"}</dd>
              <dt className="text-muted-foreground">Origem</dt>
              <dd>{c.source ?? "—"}</dd>
              <dt className="text-muted-foreground">Cadastrado</dt>
              <dd>{fmt(c.created_at)}</dd>
              <dt className="text-muted-foreground">Atualizado</dt>
              <dd>{fmt(c.updated_at)}</dd>
              {Object.entries((c.custom_fields as Record<string, Json>) ?? {}).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-muted-foreground">{k}</dt>
                  <dd>{String(v ?? "")}</dd>
                </div>
              ))}
            </dl>

            <section className="rounded-md border p-3">
              <h3 className="mb-2 font-medium">Consentimento</h3>
              <div className="flex flex-wrap gap-4">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4" /> E-mail:{" "}
                  {c.allow_email ? "permitido" : "não permitido"}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" /> WhatsApp:{" "}
                  {c.allow_whatsapp ? "permitido" : "não permitido"}
                </span>
              </div>
              {c.consent_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Registrado em {fmt(c.consent_at)}
                  {c.consent_source && ` · ${c.consent_source}`}
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-medium">Tags e listas</h3>
              <div className="flex flex-wrap gap-1.5">
                {d.tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ backgroundColor: t.color ?? "#2563eb" }}
                  >
                    {t.name}
                  </span>
                ))}
                {d.lists.map((l) => (
                  <span key={l.lists.id} className="rounded-full border px-2 py-0.5 text-xs">
                    Lista: {l.lists.name}
                  </span>
                ))}
                {!d.tags.length && !d.lists.length && (
                  <span className="text-muted-foreground">Nenhuma.</span>
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-medium">Histórico de envios</h3>
              {d.sends.length === 0 ? (
                <p className="text-muted-foreground">Ainda não recebeu nenhuma campanha.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {d.sends.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate">
                        {(s.campaigns as { name: string } | null)?.name ?? "Campanha"}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {s.channel === "email" ? "E-mail" : "WhatsApp"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {DELIVERY_LABEL[s.status] ?? s.status} · {fmt(s.sent_at ?? s.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(d.events.length > 0 || d.logs.length > 0 || d.suppressions.length > 0) && (
              <section>
                <h3 className="mb-2 font-medium">Atividade</h3>
                <ul className="grid gap-1 text-xs">
                  {[
                    ...d.events.map((e) => ({
                      id: e.id,
                      at: e.occurred_at,
                      text: `${e.channel === "email" ? "E-mail" : "WhatsApp"}: ${e.event_type}`,
                    })),
                    ...d.logs.map((l) => ({
                      id: l.id,
                      at: l.created_at,
                      text: ACTION_LABEL[l.action] ?? l.action,
                    })),
                    ...d.suppressions.map((s) => ({
                      id: s.id,
                      at: s.created_at,
                      text: `Adicionado à lista de bloqueio (${s.reason})`,
                    })),
                  ]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .map((i) => (
                      <li key={i.id} className="flex justify-between gap-2">
                        <span>{i.text}</span>
                        <span className="text-muted-foreground">{fmt(i.at)}</span>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Valid({ ok }: { ok: boolean }) {
  return ok ? (
    <span title="Válido">
      <Check className="h-3.5 w-3.5 text-emerald-600" />
    </span>
  ) : (
    <span title="Fora do padrão">
      <X className="h-3.5 w-3.5 text-amber-600" />
    </span>
  );
}
