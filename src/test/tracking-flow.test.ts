import { describe, expect, it } from "vitest";
import { TRACKING_FLOW, currentStepIndex } from "@/lib/tracking-flow";

const paid = "2026-11-01T12:00:00Z";
const at = (d: number) => new Date(new Date(paid).getTime() + d * 86_400_000 + 1000);

describe("fluxo de rastreio de 10 dias", () => {
  it("não pago não tem etapa", () => expect(currentStepIndex(null)).toBe(-1));
  it("no dia do pagamento mostra 'Pagamento aprovado'", () =>
    expect(TRACKING_FLOW[currentStepIndex(paid, at(0))]!.title).toBe("Pagamento aprovado"));
  it("entrega no dia 10", () => {
    expect(TRACKING_FLOW[currentStepIndex(paid, at(9))]!.title).not.toBe("Entregue");
    expect(TRACKING_FLOW[currentStepIndex(paid, at(10))]!.title).toBe("Entregue");
  });
});
