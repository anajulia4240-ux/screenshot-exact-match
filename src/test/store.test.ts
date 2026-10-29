import { describe, expect, it } from "vitest";
import { dayBoundary, extractAdsInfo } from "@/lib/store";

describe("extractAdsInfo", () => {
  it("separa Nome|ID e prefere o nome", () => {
    expect(extractAdsInfo({ utm_campaign: "Black Friday|120330000" }).campaign).toBe("Black Friday");
  });
  it("descarta macros não resolvidas do Meta", () => {
    expect(extractAdsInfo({ utm_campaign: "{{campaign.name}}" }).campaign).toBeNull();
  });
  it("valor só numérico não vence nome textual", () => {
    expect(extractAdsInfo({ campaign_id: "1203300001" }, { utm_campaign: "Verão" }).campaign).toBe("Verão");
  });
  it("utm_term é posicionamento, nunca conjunto", () => {
    const i = extractAdsInfo({ utm_medium: "Conjunto A", utm_term: "feed" });
    expect(i.adset).toBe("Conjunto A");
    expect(i.placement).toBe("feed");
  });
});

describe("dayBoundary", () => {
  it("usa o fuso -03:00", () => {
    expect(dayBoundary("2026-10-29")).toBe("2026-10-29T03:00:00.000Z");
  });
});
