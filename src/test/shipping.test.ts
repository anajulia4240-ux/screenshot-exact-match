import { describe, expect, it } from "vitest";
import { addBusinessDays } from "@/lib/shipping";

describe("addBusinessDays", () => {
  it("pula o fim de semana", () => {
    // sexta 06/11/2026 + 1 dia útil = segunda 09/11
    expect(addBusinessDays(new Date(2026, 10, 6), 1).getDate()).toBe(9);
  });
});
