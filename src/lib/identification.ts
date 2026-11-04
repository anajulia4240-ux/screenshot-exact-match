import { z } from "zod";

export const IDENTIFICATION_DELAY_MS = 1200;
export const WELCOME_COUPON_KEY = "byhappy_welcome_coupon";
export const identificationSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().regex(/^\d{10,11}$/).refine((value) => !/(\d)\1{5}/.test(value)),
});

export function shouldShowIdentification(path: string, leadId: string | null): boolean {
  return !path.startsWith("/checkout") && !leadId;
}

export function prefillName(name: string): string {
  return name.includes("@") ? "" : name;
}

export function readWelcomeCoupon(): { code: string; percent: number } | null {
  try {
    const parsed = z.object({ code: z.string().regex(/^[A-Z0-9_-]{1,40}$/), percent: z.number().min(1).max(100) })
      .safeParse(JSON.parse(localStorage.getItem(WELCOME_COUPON_KEY) || "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}