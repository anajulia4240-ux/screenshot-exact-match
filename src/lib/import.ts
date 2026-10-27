import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { chunk, normalizeEmail, normalizePhone, type Contact } from "@/lib/contacts";

export type TargetField =
  | "ignore"
  | "full_name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "company"
  | "source"
  | "tags"
  | "custom";

export const TARGET_LABEL: Record<TargetField, string> = {
  ignore: "Ignorar coluna",
  full_name: "Nome completo",
  first_name: "Primeiro nome",
  last_name: "Sobrenome",
  email: "E-mail",
  phone: "Telefone / WhatsApp",
  company: "Empresa",
  source: "Origem",
  tags: "Tags (separadas por vírgula)",
  custom: "Campo personalizado",
};

export type ParsedFile = { headers: string[]; rows: string[][] };

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const GUESS: [TargetField, string[]][] = [
  ["email", ["email", "mail", "correio"]],
  [
    "phone",
    ["telefone", "celular", "whatsapp", "whats", "phone", "fone", "tel", "mobile", "contato"],
  ],
  ["first_name", ["primeironome", "firstname", "prenome"]],
  ["last_name", ["sobrenome", "lastname", "ultimonome"]],
  ["full_name", ["nome", "name", "nomecompleto", "fullname", "cliente"]],
  ["company", ["empresa", "company", "companhia", "razaosocial", "loja"]],
  ["source", ["origem", "source", "fonte", "canal"]],
  ["tags", ["tags", "tag", "etiquetas", "etiqueta", "marcadores"]],
];

export function guessMapping(headers: string[]): TargetField[] {
  const used = new Set<TargetField>();
  return headers.map((h) => {
    const k = strip(h);
    for (const [field, keys] of GUESS) {
      if (used.has(field)) continue;
      if (keys.some((key) => k === key || (key.length > 3 && k.includes(key)))) {
        used.add(field);
        return field;
      }
    }
    return "ignore";
  });
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  let table: string[][];
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    table = data.map((r) => r.map(cellToString));
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    table = res.data.map((r) => r.map(cellToString));
  } else {
    throw new Error(
      "Formato não suportado. Use .csv ou .xlsx (para .xls, salve como .xlsx no Excel).",
    );
  }
  table = table.filter((r) => r.some((c) => c !== ""));
  if (table.length < 2)
    throw new Error("A planilha precisa ter uma linha de cabeçalho e pelo menos um contato.");
  const width = Math.max(...table.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => table[0]?.[i] || `Coluna ${i + 1}`);
  const rows = table.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows };
}

export type ImportRecord = {
  line: number;
  full_name: string | null;
  email: string | null;
  email_valid: boolean;
  phone: string | null;
  phone_valid: boolean;
  company: string | null;
  source: string | null;
  tags: string[];
  custom: Record<string, string>;
};

export function buildRecords(
  file: ParsedFile,
  mapping: TargetField[],
): { records: ImportRecord[]; rejected: { line: number; reason: string; raw: string[] }[] } {
  const records: ImportRecord[] = [];
  const rejected: { line: number; reason: string; raw: string[] }[] = [];
  file.rows.forEach((row, idx) => {
    const line = idx + 2; // 1-based + header
    const get = (f: TargetField): string[] =>
      mapping.map((m, i) => (m === f ? (row[i] ?? "") : "")).filter(Boolean);
    const first = get("first_name").join(" ");
    const last = get("last_name").join(" ");
    const full = get("full_name")[0] || [first, last].filter(Boolean).join(" ");
    const e = normalizeEmail(get("email")[0]);
    const p = normalizePhone(get("phone")[0]);
    const custom: Record<string, string> = {};
    mapping.forEach((m, i) => {
      const header = file.headers[i];
      const value = row[i];
      if (m === "custom" && value && header) custom[header] = value;
    });
    if (!e.email && !p.phone) {
      rejected.push({ line, reason: "Sem e-mail e sem telefone", raw: row });
      return;
    }
    records.push({
      line,
      full_name: full || null,
      email: e.email,
      email_valid: e.valid,
      phone: p.phone,
      phone_valid: p.valid,
      company: get("company")[0] || null,
      source: get("source")[0] || null,
      tags: get("tags")
        .flatMap((t) => t.split(/[,;|]/))
        .map((t) => t.trim())
        .filter(Boolean),
      custom,
    });
  });
  return { records, rejected };
}

export type ImportOptions = {
  duplicates: "skip" | "update";
  defaultSource: string;
  allowEmail: boolean;
  allowWhatsapp: boolean;
  consentSource: string;
  listId: string | null;
  tagIds: string[];
  userId: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  duplicatesInFile: number;
  rejected: { line: number; reason: string; raw: string[] }[];
};

async function ensureTags(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return map;
  const { data: existing, error } = await supabase.from("tags").select("id,name");
  if (error) throw error;
  const byLower = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
  const missing = unique.filter((n) => !byLower.has(n.toLowerCase()));
  if (missing.length) {
    const { data: created, error: e2 } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ name })))
      .select("id,name");
    if (e2) throw e2;
    created.forEach((t) => byLower.set(t.name.toLowerCase(), t));
  }
  unique.forEach((n) => {
    const t = byLower.get(n.toLowerCase());
    if (t) map.set(n.toLowerCase(), t.id);
  });
  return map;
}

export async function runImport(
  records: ImportRecord[],
  opts: ImportOptions,
  preRejected: ImportResult["rejected"],
  onProgress: (done: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    duplicatesInFile: 0,
    rejected: [...preRejected],
  };

  // 1. Dedupe inside the file (first occurrence wins)
  const seen = new Set<string>();
  const unique: ImportRecord[] = [];
  for (const r of records) {
    const keys = [r.email && `e:${r.email}`, r.phone && `p:${r.phone}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) {
      result.duplicatesInFile++;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    unique.push(r);
  }

  const tagMap = await ensureTags(unique.flatMap((r) => r.tags));
  const now = new Date().toISOString();
  let done = records.length - unique.length;
  onProgress(done);

  for (const part of chunk(unique, 200)) {
    // 2. Find existing contacts by e-mail or phone
    const emails = part.map((r) => r.email).filter(Boolean) as string[];
    const phones = part.map((r) => r.phone).filter(Boolean) as string[];
    const existing: Contact[] = [];
    if (emails.length) {
      const { data, error } = await supabase.from("contacts").select("*").in("email", emails);
      if (error) throw error;
      existing.push(...data);
    }
    if (phones.length) {
      const { data, error } = await supabase.from("contacts").select("*").in("phone", phones);
      if (error) throw error;
      existing.push(...data.filter((c) => !existing.some((x) => x.id === c.id)));
    }
    const byEmail = new Map(
      existing.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]),
    );
    const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [c.phone!, c]));

    const inserts: (TablesInsert<"contacts"> & { _rec: ImportRecord })[] = [];
    const contactIdsForRecord = new Map<ImportRecord, string>();

    for (const r of part) {
      const match = (r.email && byEmail.get(r.email)) || (r.phone && byPhone.get(r.phone)) || null;
      if (match) {
        contactIdsForRecord.set(r, match.id);
        if (opts.duplicates === "skip") {
          result.unchanged++;
          continue;
        }
        const patch: Partial<Contact> = {};
        if (r.full_name && r.full_name !== match.full_name) patch.full_name = r.full_name;
        if (r.company && r.company !== match.company) patch.company = r.company;
        if (r.email && !match.email && !byEmail.has(r.email))
          Object.assign(patch, { email: r.email, email_valid: r.email_valid });
        if (r.phone && !match.phone && !byPhone.has(r.phone))
          Object.assign(patch, { phone: r.phone, phone_valid: r.phone_valid });
        if (Object.keys(r.custom).length)
          patch.custom_fields = {
            ...((match.custom_fields as Record<string, Json>) ?? {}),
            ...r.custom,
          };
        // Import only grants consent, never revokes it.
        if (opts.allowEmail && !match.allow_email) patch.allow_email = true;
        if (opts.allowWhatsapp && !match.allow_whatsapp) patch.allow_whatsapp = true;
        if ((patch.allow_email || patch.allow_whatsapp) && !match.consent_at)
          Object.assign(patch, { consent_at: now, consent_source: opts.consentSource });
        if (!Object.keys(patch).length) {
          result.unchanged++;
          continue;
        }
        const { error } = await supabase.from("contacts").update(patch).eq("id", match.id);
        if (error)
          result.rejected.push({
            line: r.line,
            reason: error.message,
            raw: [r.full_name ?? "", r.email ?? "", r.phone ?? ""],
          });
        else result.updated++;
      } else {
        const consent = opts.allowEmail || opts.allowWhatsapp;
        inserts.push({
          _rec: r,
          full_name: r.full_name,
          email: r.email,
          email_valid: r.email_valid,
          phone: r.phone,
          phone_valid: r.phone_valid,
          company: r.company,
          source: r.source || opts.defaultSource || null,
          allow_email: opts.allowEmail,
          allow_whatsapp: opts.allowWhatsapp,
          consent_at: consent ? now : null,
          consent_source: consent ? opts.consentSource : null,
          custom_fields: r.custom,
          created_by: opts.userId,
        });
      }
    }

    // 3. Insert new contacts (batch, falling back to row-by-row so one bad row doesn't sink the batch)
    if (inserts.length) {
      const payload = inserts.map(({ _rec, ...row }) => row);
      const { data, error } = await supabase.from("contacts").insert(payload).select("id");
      if (!error && data) {
        data.forEach((c, i) => {
          const ins = inserts[i];
          if (ins) contactIdsForRecord.set(ins._rec, c.id);
        });
        result.created += data.length;
      } else {
        for (const ins of inserts) {
          const { _rec, ...row } = ins;
          const { data: one, error: e1 } = await supabase
            .from("contacts")
            .insert(row)
            .select("id")
            .single();
          if (e1) {
            const reason =
              e1.code === "23505" ? "Duplicado (e-mail ou telefone já cadastrado)" : e1.message;
            result.rejected.push({
              line: _rec.line,
              reason,
              raw: [_rec.full_name ?? "", _rec.email ?? "", _rec.phone ?? ""],
            });
          } else {
            contactIdsForRecord.set(_rec, one.id);
            result.created++;
          }
        }
      }
    }

    // 4. Tags and list membership (also for existing contacts)
    const tagRows: { contact_id: string; tag_id: string }[] = [];
    const listRows: { list_id: string; contact_id: string }[] = [];
    for (const [rec, id] of contactIdsForRecord) {
      const tagIds = new Set([
        ...opts.tagIds,
        ...rec.tags.map((t) => tagMap.get(t.toLowerCase())).filter(Boolean),
      ] as string[]);
      tagIds.forEach((tag_id) => tagRows.push({ contact_id: id, tag_id }));
      if (opts.listId) listRows.push({ list_id: opts.listId, contact_id: id });
    }
    if (tagRows.length) {
      const { error } = await supabase
        .from("contact_tags")
        .upsert(tagRows, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    if (listRows.length) {
      const { error } = await supabase
        .from("list_members")
        .upsert(listRows, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    done += part.length;
    onProgress(done);
  }
  return result;
}
