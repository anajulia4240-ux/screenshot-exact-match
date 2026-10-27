import { supabase } from "@/integrations/supabase/client";
import { chunk, OPTED_OUT, STATUS_LABEL, type ContactStatus } from "@/lib/contacts";
import { logActivity } from "@/lib/audit";

/** Suppression = permanent "do not contact" record checked before any send. */
export async function addSuppressions(
  contacts: { id: string; email: string | null; phone: string | null }[],
  reason: string,
  userId?: string,
) {
  const rows = contacts.map((c) => ({
    contact_id: c.id,
    email: c.email,
    phone: c.phone,
    channel: null,
    reason,
    source: "manual",
    created_by: userId ?? null,
  }));
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from("suppressions").insert(part);
    if (error) throw error;
  }
}

export async function bulkAddTag(ids: string[], tagId: string) {
  for (const part of chunk(ids, 500)) {
    const { error } = await supabase.from("contact_tags").upsert(
      part.map((contact_id) => ({ contact_id, tag_id: tagId })),
      { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  await logActivity("contacts.bulk_tag_add", { count: ids.length, tag_id: tagId });
}

export async function bulkRemoveTag(ids: string[], tagId: string) {
  for (const part of chunk(ids, 150)) {
    const { error } = await supabase
      .from("contact_tags")
      .delete()
      .eq("tag_id", tagId)
      .in("contact_id", part);
    if (error) throw error;
  }
  await logActivity("contacts.bulk_tag_remove", { count: ids.length, tag_id: tagId });
}

export async function bulkAddToList(ids: string[], listId: string) {
  for (const part of chunk(ids, 500)) {
    const { error } = await supabase.from("list_members").upsert(
      part.map((contact_id) => ({ list_id: listId, contact_id })),
      { onConflict: "list_id,contact_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  await supabase.from("lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
  await logActivity("contacts.bulk_list_add", { count: ids.length }, "list", listId);
}

export async function bulkRemoveFromList(ids: string[], listId: string) {
  for (const part of chunk(ids, 150)) {
    const { error } = await supabase
      .from("list_members")
      .delete()
      .eq("list_id", listId)
      .in("contact_id", part);
    if (error) throw error;
  }
  await supabase.from("lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
  await logActivity("contacts.bulk_list_remove", { count: ids.length }, "list", listId);
}

export async function bulkSetStatus(ids: string[], status: ContactStatus, userId?: string) {
  for (const part of chunk(ids, 150)) {
    const { data, error } = await supabase
      .from("contacts")
      .update({ status })
      .in("id", part)
      .select("id,email,phone");
    if (error) throw error;
    if (OPTED_OUT.includes(status)) await addSuppressions(data, STATUS_LABEL[status], userId);
  }
  await logActivity("contacts.bulk_status", { count: ids.length, status });
}

export async function bulkSetConsent(
  ids: string[],
  channel: "email" | "whatsapp",
  allow: boolean,
  consentSource: string,
) {
  const patch =
    channel === "email"
      ? { allow_email: allow, ...(allow ? { consent_source: consentSource } : {}) }
      : { allow_whatsapp: allow, ...(allow ? { consent_source: consentSource } : {}) };
  for (const part of chunk(ids, 150)) {
    const { error } = await supabase.from("contacts").update(patch).in("id", part);
    if (error) throw error;
    if (allow)
      await supabase
        .from("contacts")
        .update({ consent_at: new Date().toISOString() })
        .in("id", part)
        .is("consent_at", null);
  }
  await logActivity("contacts.bulk_consent", { count: ids.length, channel, allow });
}

export async function bulkDelete(ids: string[]) {
  for (const part of chunk(ids, 150)) {
    const { error } = await supabase.from("contacts").delete().in("id", part);
    if (error) throw error;
  }
  await logActivity("contacts.bulk_delete", { count: ids.length });
}
