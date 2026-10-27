import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, formatPhone } from "@/lib/contacts";
import { buildRecords, guessMapping } from "@/lib/import";

describe("normalizePhone", () => {
  it("adds +55 to Brazilian numbers without country code", () => {
    expect(normalizePhone("(11) 99999-8888")).toEqual({ phone: "+5511999998888", valid: true });
    expect(normalizePhone("11 3333-4444")).toEqual({ phone: "+551133334444", valid: true });
  });
  it("keeps numbers already with country code", () => {
    expect(normalizePhone("+55 21 98888-7777")).toEqual({ phone: "+5521988887777", valid: true });
    expect(normalizePhone("5521988887777")).toEqual({ phone: "+5521988887777", valid: true });
  });
  it("strips trunk zero", () => {
    expect(normalizePhone("011 99999-8888").phone).toBe("+5511999998888");
  });
  it("flags malformed numbers as invalid but keeps them", () => {
    expect(normalizePhone("12345")).toEqual({ phone: "+12345", valid: false });
    expect(normalizePhone("")).toEqual({ phone: null, valid: false });
  });
  it("formats Brazilian numbers", () => {
    expect(formatPhone("+5511999998888")).toBe("(11) 99999-8888");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and validates", () => {
    expect(normalizeEmail("  Ana@Loja.COM ")).toEqual({ email: "ana@loja.com", valid: true });
    expect(normalizeEmail("ana@loja")).toEqual({ email: "ana@loja", valid: false });
  });
});

describe("import mapping", () => {
  it("guesses Portuguese headers", () => {
    expect(guessMapping(["Nome", "E-mail", "Celular", "Empresa", "Etiquetas", "Cidade"])).toEqual([
      "full_name",
      "email",
      "phone",
      "company",
      "tags",
      "ignore",
    ]);
  });
  it("rejects rows without e-mail and phone and splits tags", () => {
    const { records, rejected } = buildRecords(
      {
        headers: ["Nome", "Email", "Tags"],
        rows: [
          ["Ana", "ana@x.com", "vip, loja"],
          ["Bia", "", ""],
        ],
      },
      ["full_name", "email", "tags"],
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.tags).toEqual(["vip", "loja"]);
    expect(rejected[0]).toMatchObject({ line: 3, reason: "Sem e-mail e sem telefone" });
  });
});
