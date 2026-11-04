import { describe, expect, it } from "vitest";
import { IDENTIFICATION_DELAY_MS, identificationSchema, prefillName, shouldShowIdentification } from "@/lib/identification";
import { IDENTIFICATION_COUPON } from "@/lib/coupon-defaults";

describe("identificação", () => {
  it("espera 1,2 segundo", () => expect(IDENTIFICATION_DELAY_MS).toBe(1200));
  it("aparece sem lead e não reaparece com lead", () => {
    expect(shouldShowIdentification("/", null)).toBe(true);
    expect(shouldShowIdentification("/", "lead-salvo")).toBe(false);
  });
  it("nunca aparece em caminhos iniciados por checkout", () => {
    expect(shouldShowIdentification("/checkout", null)).toBe(false);
    expect(shouldShowIdentification("/checkout/pagamento", null)).toBe(false);
  });
  it("aceita nome de dois caracteres e rejeita espaços ou mais de 60", () => {
    expect(identificationSchema.safeParse({ name: "  Lu  ", phone: "11987654321" }).success).toBe(true);
    expect(identificationSchema.safeParse({ name: " A ", phone: "11987654321" }).success).toBe(false);
    expect(identificationSchema.safeParse({ name: "A".repeat(61), phone: "11987654321" }).success).toBe(false);
  });
  it("aceita somente dez ou onze dígitos", () => {
    for (const phone of ["1134567890", "11987654321"]) expect(identificationSchema.safeParse({ name: "Ana", phone }).success).toBe(true);
    for (const phone of ["123456789", "5511987654321"]) expect(identificationSchema.safeParse({ name: "Ana", phone }).success).toBe(false);
  });
  it("rejeita seis dígitos consecutivos iguais", () => {
    expect(identificationSchema.safeParse({ name: "Ana", phone: "11999999432" }).success).toBe(false);
    expect(identificationSchema.safeParse({ name: "Ana", phone: "11000000432" }).success).toBe(false);
  });
  it("oferece dez por cento", () => expect(IDENTIFICATION_COUPON.percent).toBe(10));
  it("não preenche nome parecido com e-mail", () => {
    expect(prefillName("ana@example.com")).toBe("");
    expect(prefillName("Ana")).toBe("Ana");
  });
});