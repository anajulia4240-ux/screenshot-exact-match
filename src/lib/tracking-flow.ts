// Linha do tempo de 10 dias do rastreio, calculada a partir da data de pagamento.
// Cada etapa libera no dia indicado (dia 0 = pagamento aprovado). Entrega no dia 10.

export interface TrackingStep {
  day: number;
  title: string;
  text: string;
}

export const TRACKING_FLOW: TrackingStep[] = [
  { day: 0, title: "Pagamento aprovado", text: "Recebemos seu pagamento e geramos seu código de rastreio." },
  { day: 1, title: "Pedido em separação", text: "Seus produtos estão sendo separados e embalados." },
  { day: 2, title: "Pedido postado", text: "Seu pedido foi entregue à transportadora." },
  { day: 3, title: "Em trânsito", text: "Objeto saiu do centro de distribuição de origem." },
  { day: 5, title: "Em trânsito para sua região", text: "Objeto em transferência para a unidade do seu estado." },
  { day: 7, title: "Chegou na unidade da sua cidade", text: "Objeto recebido na unidade de distribuição local." },
  { day: 9, title: "Saiu para entrega", text: "O entregador está a caminho do seu endereço." },
  { day: 10, title: "Entregue", text: "Pedido entregue. Aproveite seu tratamento!" },
];

const DAY = 86_400_000;

/** Índice da etapa atual (-1 = ainda não pago). */
export function currentStepIndex(paidAt: string | null, now: Date = new Date()): number {
  if (!paidAt) return -1;
  const elapsed = Math.floor((now.getTime() - new Date(paidAt).getTime()) / DAY);
  let idx = 0;
  TRACKING_FLOW.forEach((s, i) => {
    if (elapsed >= s.day) idx = i;
  });
  return idx;
}

export function stepDate(paidAt: string, day: number): Date {
  return new Date(new Date(paidAt).getTime() + day * DAY);
}
