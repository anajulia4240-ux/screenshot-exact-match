import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser, useTags } from "@/hooks/use-catalog";
import { logActivity } from "@/lib/audit";
import {
  friendlyDbError,
  normalizeEmail,
  normalizePhone,
  OPTED_OUT,
  STATUS_LABEL,
  STATUSES,
  type Contact,
  type ContactStatus,
} from "@/lib/contacts";
import { addSuppressions } from "@/lib/contact-actions";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; contact?: Contact | null };

export function ContactFormDialog({ open, onOpenChange, contact }: Props) {
  const qc = useQueryClient();
  const tags = useTags();
  const me = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    company: "",
    source: "",
    status: "active" as ContactStatus,
    allow_email: false,
    allow_whatsapp: false,
    consent_source: "",
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [custom, setCustom] = useState<{ k: string; v: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      full_name: contact?.full_name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      company: contact?.company ?? "",
      source: contact?.source ?? "Cadastro manual",
      status: contact?.status ?? "active",
      allow_email: contact?.allow_email ?? false,
      allow_whatsapp: contact?.allow_whatsapp ?? false,
      consent_source: contact?.consent_source ?? "",
    });
    setCustom(
      Object.entries((contact?.custom_fields as Record<string, Json>) ?? {}).map(([k, v]) => ({
        k,
        v: String(v ?? ""),
      })),
    );
    setTagIds([]);
    if (contact) {
      supabase
        .from("contact_tags")
        .select("tag_id")
        .eq("contact_id", contact.id)
        .then(({ data }) => setTagIds((data ?? []).map((t) => t.tag_id)));
    }
  }, [open, contact]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const e = normalizeEmail(form.email);
  const p = normalizePhone(form.phone);
  const needsConsentSource =
    (form.allow_email || form.allow_whatsapp) && !form.consent_source.trim();

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!e.email && !p.phone) {
      toast.error("Informe pelo menos um e-mail ou telefone.");
      return;
    }
    if (e.email && !e.valid) {
      toast.error("E-mail inválido.");
      return;
    }
    if (needsConsentSource) {
      toast.error("Informe como o consentimento foi obtido.");
      return;
    }
    setSaving(true);
    const consentGiven = form.allow_email || form.allow_whatsapp;
    const row = {
      full_name: form.full_name.trim() || null,
      email: e.email,
      email_valid: e.valid,
      phone: p.phone,
      phone_valid: p.valid,
      company: form.company.trim() || null,
      source: form.source.trim() || null,
      status: form.status,
      allow_email: form.allow_email,
      allow_whatsapp: form.allow_whatsapp,
      consent_source: consentGiven ? form.consent_source.trim() : (contact?.consent_source ?? null),
      consent_at: consentGiven
        ? (contact?.consent_at ?? new Date().toISOString())
        : (contact?.consent_at ?? null),
      custom_fields: Object.fromEntries(
        custom.filter((c) => c.k.trim()).map((c) => [c.k.trim(), c.v]),
      ),
    };
    const res = contact
      ? await supabase.from("contacts").update(row).eq("id", contact.id).select("id").single()
      : await supabase
          .from("contacts")
          .insert({ ...row, created_by: me.data?.id ?? null })
          .select("id")
          .single();
    if (res.error) {
      setSaving(false);
      {
        toast.error(friendlyDbError(res.error));
        return;
      }
    }
    const id = res.data.id;
    await supabase.from("contact_tags").delete().eq("contact_id", id);
    if (tagIds.length)
      await supabase
        .from("contact_tags")
        .insert(tagIds.map((tag_id) => ({ contact_id: id, tag_id })));
    if (OPTED_OUT.includes(form.status) && contact?.status !== form.status) {
      await addSuppressions(
        [{ id, email: row.email, phone: row.phone }],
        STATUS_LABEL[form.status],
        me.data?.id,
      );
    }
    await logActivity(
      contact ? "contact.update" : "contact.create",
      { email: row.email, phone: row.phone },
      "contact",
      id,
    );
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["contact", id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast.success(contact ? "Contato atualizado." : "Contato criado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contact ? "Editar contato" : "Novo contato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input
                value={form.full_name}
                onChange={(ev) => set("full_name", ev.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Empresa">
              <Input value={form.company} onChange={(ev) => set("company", ev.target.value)} />
            </Field>
            <Field
              label="E-mail"
              hint={form.email && !e.valid ? "E-mail inválido" : undefined}
              warn={!!form.email && !e.valid}
            >
              <Input
                type="email"
                value={form.email}
                onChange={(ev) => set("email", ev.target.value)}
              />
            </Field>
            <Field
              label="Telefone / WhatsApp"
              hint={
                form.phone
                  ? p.valid
                    ? `Será salvo como ${p.phone}`
                    : "Telefone fora do padrão — será salvo, mas marcado como inválido"
                  : "Com DDD. Ex.: (11) 99999-8888"
              }
              warn={!!form.phone && !p.valid}
            >
              <Input value={form.phone} onChange={(ev) => set("phone", ev.target.value)} />
            </Field>
            <Field label="Origem">
              <Input
                value={form.source}
                onChange={(ev) => set("source", ev.target.value)}
                placeholder="Ex.: Loja, Instagram, Evento"
              />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v as ContactStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">Consentimento por canal</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Só ative se a pessoa autorizou receber mensagens nesse canal. Campanhas respeitam essa
              escolha.
            </p>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.allow_email} onCheckedChange={(v) => set("allow_email", v)} />{" "}
                Aceita e-mail
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.allow_whatsapp}
                  onCheckedChange={(v) => set("allow_whatsapp", v)}
                />{" "}
                Aceita WhatsApp
              </label>
            </div>
            {(form.allow_email || form.allow_whatsapp) && (
              <div className="mt-3">
                <Field label="Como o consentimento foi obtido" warn={needsConsentSource}>
                  <Input
                    value={form.consent_source}
                    onChange={(ev) => set("consent_source", ev.target.value)}
                    placeholder="Ex.: checkout da loja, formulário do site"
                  />
                </Field>
              </div>
            )}
          </div>

          <div>
            <Label className="text-sm">Tags</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(tags.data ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Nenhuma tag criada. Crie em "Tags" na lista de contatos.
                </span>
              )}
              {(tags.data ?? []).map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() =>
                      setTagIds((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${on ? "border-transparent text-white" : "bg-card text-foreground hover:bg-accent"}`}
                    style={on ? { backgroundColor: t.color ?? "#2563eb" } : undefined}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Campos personalizados</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCustom((c) => [...c, { k: "", v: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            <div className="mt-1 grid gap-2">
              {custom.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Campo"
                    value={c.k}
                    onChange={(ev) =>
                      setCustom((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, k: ev.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    placeholder="Valor"
                    value={c.v}
                    onChange={(ev) =>
                      setCustom((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, v: ev.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remover campo"
                    onClick={() => setCustom((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  warn,
  children,
}: {
  label: string;
  hint?: string | undefined;
  warn?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && (
        <p className={`text-xs ${warn ? "text-amber-600" : "text-muted-foreground"}`}>{hint}</p>
      )}
    </div>
  );
}
