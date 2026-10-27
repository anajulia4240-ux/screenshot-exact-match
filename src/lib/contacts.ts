import type { Database } from "@/integrations/supabase/types";

export type ContactStatus = Database["public"]["Enums"]["contact_status"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type ContactList = Database["public"]["Tables"]["lists"]["Row"];

export const STATUS_LABEL: Record<ContactStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  unsubscribed: "Descadastrado",
  blocked: "Bloqueado",
  bounced: "E-mail rejeitado",
};

export const STATUS_CLASS: Record<ContactStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-muted text-muted-foreground border-border",
  unsubscribed: "bg-amber-50 text-amber-700 border-amber-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
  bounced: "bg-orange-50 text-orange-700 border-orange-200",
};

export const STATUSES = Object.keys(STATUS_LABEL) as ContactStatus[];

/** Status that must never receive messages. Blocking one also creates a suppression entry. */
export const OPTED_OUT: ContactStatus[] = ["unsubscribed", "blocked", "bounced"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): { email: string | null; valid: boolean } {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v) return { email: null, valid: false };
  return { email: v, valid: EMAIL_RE.test(v) };
}

/**
 * Normalizes phones to E.164 ("+5511999998888").
 * Brazilian numbers without country code (10 or 11 digits) get +55.
 * Valid = Brazilian landline/mobile with DDD, or any other international number of 10–15 digits that came with "+".
 */
export function normalizePhone(raw: unknown): { phone: string | null; valid: boolean } {
  const original = String(raw ?? "").trim();
  if (!original) return { phone: null, valid: false };
  const hadPlus = original.startsWith("+") || original.startsWith("00");
  let d = original.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return { phone: null, valid: false };
  if (!hadPlus && (d.length === 10 || d.length === 11)) d = "55" + d;
  // Brazilian numbers with a leading trunk zero, e.g. 011 99999-8888
  if (!hadPlus && d.length === 12 && d.startsWith("0")) d = "55" + d.slice(1);

  if (d.startsWith("55")) {
    const rest = d.slice(2);
    const ddd = Number(rest.slice(0, 2));
    const num = rest.slice(2);
    const valid =
      ddd >= 11 &&
      ddd <= 99 &&
      ((num.length === 9 && num.startsWith("9")) || (num.length === 8 && /^[2-5]/.test(num)));
    return { phone: "+" + d, valid };
  }
  return { phone: "+" + d, valid: hadPlus && d.length >= 10 && d.length <= 15 };
}

export function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const m = phone.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

/** Removes characters that would break a PostgREST `or=` filter. */
export function safeSearch(term: string): string {
  return term.replace(/[,()*%\\:"]/g, " ").trim();
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function friendlyDbError(err: { code?: string; message: string }): string {
  if (err.code === "23505") {
    if (err.message.includes("email")) return "Já existe um contato com este e-mail.";
    if (err.message.includes("phone")) return "Já existe um contato com este telefone.";
    return "Registro duplicado.";
  }
  if (err.code === "42501") return "Sua conta não tem permissão para esta ação.";
  return err.message;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" + BOM so Excel em português abre com acentos e colunas corretas
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
