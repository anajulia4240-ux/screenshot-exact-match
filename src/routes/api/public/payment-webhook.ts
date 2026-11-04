import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Fruitfy (Integrações > Webhooks, evento order_paid).
 * O corpo NÃO é confiado: o status é reconsultado na API da Fruitfy antes de dar baixa,
 * e o valor usado é sempre o salvo no pedido. Todo aviso fica registrado em events.
 * Responde 200 rápido (exceto JSON inválido → 400) para a Fruitfy não reenviar à toa.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const strOf = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && v.length <= 100 ? v.trim() : typeof v === "number" ? String(v) : null;

const REF_KEYS = ["external_id", "externalRef", "externalId", "external_ref", "reference", "identifier"];
const TX_KEYS = ["hash", "transaction_hash", "transaction_id", "transactionId", "txid", "id"];

/** Primeiro valor encontrado nas chaves, olhando o objeto order e depois o topo do aviso. */
function pick(sources: Obj[], keys: string[]): string[] {
  const out: string[] = [];
  for (const s of sources)
    for (const k of keys) {
      const v = strOf(s[k]);
      if (v && !out.includes(v)) out.push(v);
    }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw: unknown = await request.json().catch(() => undefined);
        if (!isObj(raw)) return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });

        const pay = await import("@/lib/payments.server");
        const order = isObj(raw["order"]) ? raw["order"] : {};
        const meta = isObj(order["metadata"]) ? order["metadata"] : isObj(raw["metadata"]) ? raw["metadata"] : {};
        // No topo do aviso, "id" seria o próprio aviso — só vale dentro de order.
        const topNoId: Obj = { ...raw, id: undefined };

        const refs = [...pick([order, topNoId], REF_KEYS), ...pick([meta], ["reference"])];
        const txs = pick([order, topNoId], TX_KEYS);
        const status = (strOf(order["status"]) ?? strOf(raw["status"]) ?? strOf(raw["event"]) ?? "unknown").toLowerCase();
        const info = { event: strOf(raw["event"]), status, reference: refs[0] ?? null, transaction_id: txs[0] ?? null };

        try {
          // (a) pela referência (id do pedido)
          let found: Awaited<ReturnType<typeof pay.loadOrder>> = null;
          for (const r of refs) if (!found) found = await pay.findOrderById(r);
          // (b) pela transação, com até 4 tentativas (pedido pode estar sendo salvo)
          for (let i = 0; !found && txs.length && i < 4; i++) {
            for (const t of txs) if (!found) found = await pay.findOrderByTransaction(t);
            if (!found && i < 3) await sleep(300);
          }

          const kind = status.replace(/[^a-z_]/g, "") || "unknown";
          if (!found) {
            await pay.logWebhookEvent("webhook_unmatched", info, raw);
            return Response.json({ ok: true, ignored: "order_not_found" });
          }
          // Prefixo "webhook_": um aviso não confirmado nunca aparece como venda no painel.
          await pay.logWebhookEvent(`webhook_pix_${kind}`, info, raw, found.id);

          if (found.status === "paid") return Response.json({ ok: true, duplicate: true });
          const r = await pay.confirmOrderFromGateway(found, "webhook");
          if (r.paid && !r.changed) return Response.json({ ok: true, duplicate: true });
          return Response.json({ ok: true, paid: r.paid, status: r.remoteStatus });
        } catch (e) {
          console.error("[webhook] erro", e);
          return Response.json({ ok: true, error: "processing_failed" });
        }
      },
    },
  },
});
