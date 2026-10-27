import { supabase } from "@/integrations/supabase/client";
import { OPTED_OUT, type ContactStatus } from "@/lib/contacts";

/**
 * Segment rules are stored in `lists.rules` and evaluated at query time,
 * so a segment always reflects the current contacts (automatic update).
 * All conditions must match (AND).
 */
export type BoolField =
  "allow_email" | "allow_whatsapp" | "email_valid" | "phone_valid" | "has_email" | "has_phone";
export type TextField = "source" | "company" | "email";

export type SegmentCondition =
  | { field: "status"; op: "eq" | "neq"; value: ContactStatus }
  | { field: "tag"; op: "has" | "not_has"; value: string }
  | { field: "list"; op: "in" | "not_in"; value: string }
  | { field: BoolField; op: "is"; value: boolean }
  | { field: TextField; op: "eq" | "contains"; value: string }
  | { field: "created_at"; op: "after" | "before"; value: string };

export type SegmentRules = { conditions: SegmentCondition[]; excludeOptedOut: boolean };

export const EMPTY_RULES: SegmentRules = { conditions: [], excludeOptedOut: true };

export function parseRules(raw: unknown): SegmentRules {
  const r = (raw ?? {}) as Partial<SegmentRules>;
  return {
    conditions: Array.isArray(r.conditions) ? r.conditions : [],
    excludeOptedOut: r.excludeOptedOut !== false,
  };
}

export const FIELD_LABEL: Record<SegmentCondition["field"], string> = {
  status: "Status",
  tag: "Tag",
  list: "Lista estática",
  allow_email: "Permite e-mail",
  allow_whatsapp: "Permite WhatsApp",
  email_valid: "E-mail válido",
  phone_valid: "Telefone válido",
  has_email: "Tem e-mail",
  has_phone: "Tem telefone",
  source: "Origem",
  company: "Empresa",
  email: "E-mail",
  created_at: "Cadastrado em",
};

// The PostgREST builder type changes with every chained call; a loose type keeps this helper reusable
// for selects, counts and id-only fetches.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;

/** Extra embedded resources needed by tag/list conditions (aliased so several can coexist). */
export function segmentSelect(rules: SegmentRules, base: string): string {
  const parts = [base];
  rules.conditions.forEach((c, i) => {
    if (isIncomplete(c)) return;
    if (c.field === "tag")
      parts.push(`c${i}:contact_tags!${c.op === "has" ? "inner" : "left"}(tag_id)`);
    if (c.field === "list")
      parts.push(`c${i}:list_members!${c.op === "in" ? "inner" : "left"}(list_id)`);
  });
  return parts.join(",");
}

/** Tag/list conditions without a chosen value are ignored instead of breaking the query. */
const isIncomplete = (c: SegmentCondition) => (c.field === "tag" || c.field === "list") && !c.value;

const like = (v: string) => `%${v.replace(/[%_\\]/g, (m) => "\\" + m)}%`;

export function applySegment(q: Builder, rules: SegmentRules): Builder {
  if (rules.excludeOptedOut) q = q.not("status", "in", `(${OPTED_OUT.join(",")})`);
  rules.conditions.forEach((c, i) => {
    if (isIncomplete(c)) return;
    switch (c.field) {
      case "status":
        q = c.op === "eq" ? q.eq("status", c.value) : q.neq("status", c.value);
        break;
      case "tag":
        q = q.eq(`c${i}.tag_id`, c.value);
        if (c.op === "not_has") q = q.is(`c${i}`, null);
        break;
      case "list":
        q = q.eq(`c${i}.list_id`, c.value);
        if (c.op === "not_in") q = q.is(`c${i}`, null);
        break;
      case "has_email":
        q = c.value ? q.not("email", "is", null) : q.is("email", null);
        break;
      case "has_phone":
        q = c.value ? q.not("phone", "is", null) : q.is("phone", null);
        break;
      case "allow_email":
      case "allow_whatsapp":
      case "email_valid":
      case "phone_valid":
        q = q.eq(c.field, c.value);
        break;
      case "source":
      case "company":
      case "email":
        if (!c.value.trim()) break;
        q = c.op === "eq" ? q.eq(c.field, c.value.trim()) : q.ilike(c.field, like(c.value.trim()));
        break;
      case "created_at":
        if (!c.value) break;
        q = c.op === "after" ? q.gte("created_at", c.value) : q.lt("created_at", c.value);
        break;
    }
  });
  return q;
}

/** Channel reachability: what a campaign on that channel could actually use. */
export function applyChannel(
  q: Builder,
  channel: "email" | "whatsapp" | null,
  prefix = "",
): Builder {
  if (!channel) return q;
  const p = prefix ? `${prefix}.` : "";
  q = q.eq(`${p}status`, "active");
  return channel === "email"
    ? q.eq(`${p}allow_email`, true).eq(`${p}email_valid`, true)
    : q.eq(`${p}allow_whatsapp`, true).eq(`${p}phone_valid`, true);
}

export async function countSegment(
  rules: SegmentRules,
  channel: "email" | "whatsapp" | null = null,
): Promise<number> {
  let q = supabase
    .from("contacts")
    .select(segmentSelect(rules, "id"), { count: "exact", head: true });
  q = applyChannel(applySegment(q, rules), channel);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function countStaticList(
  listId: string,
  channel: "email" | "whatsapp" | null = null,
): Promise<number> {
  let q: Builder = supabase
    .from("list_members")
    .select(
      channel
        ? "contact_id, contacts!inner(status,allow_email,allow_whatsapp,email_valid,phone_valid)"
        : "contact_id",
      { count: "exact", head: true },
    )
    .eq("list_id", listId);
  q = applyChannel(q, channel, "contacts");
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Fetches every id matching a contacts query in pages of 1000 (PostgREST max rows). */
export async function fetchAllIds(build: () => Builder, limit = 50000): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await build()
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    ids.push(...(data as { id: string }[]).map((r) => r.id));
    if (data.length < 1000) break;
  }
  return ids;
}
