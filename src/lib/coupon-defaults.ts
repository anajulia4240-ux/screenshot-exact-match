// Cupom de identificação: quem informa nome + WhatsApp no checkout ganha 10% OFF.
// Funciona mesmo sem cadastro na aba Cupons. Se você criar HAPPY10 lá, vale o que estiver no
// painel (por exemplo, para desativar ou mudar o percentual).

export const IDENTIFICATION_COUPON = { code: "HAPPY10", percent: 10 } as const;

export function builtinCoupon(code: string) {
  return code.trim().toUpperCase() === IDENTIFICATION_COUPON.code
    ? {
        code: IDENTIFICATION_COUPON.code,
        percent: IDENTIFICATION_COUPON.percent,
        min_value_cents: 0,
        active: true,
        expires_at: null as string | null,
      }
    : null;
}
