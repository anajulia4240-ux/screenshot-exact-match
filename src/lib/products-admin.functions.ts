// Server fns da aba "Adicionar produto": leitura pública (só ativos) e gravação só para administradores.
// Produtos ficam em app_settings "custom_products"; fotos no bucket público "product-images".
import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CustomProduct } from "@/lib/catalog";

// ---------- helpers (servidor) ----------
async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Apenas administradores podem gerenciar produtos.");
  return supabaseAdmin;
}

async function readAll(): Promise<CustomProduct[]> {
  const { loadCustomProducts } = await import("./custom-products.server");
  return loadCustomProducts();
}

async function writeAll(list: CustomProduct[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { CUSTOM_PRODUCTS_KEY } = await import("./custom-products.server");
  const { applyCustomProducts } = await import("@/lib/catalog");
  const { error } = await supabaseAdmin.from("app_settings").upsert(
    {
      key: CUSTOM_PRODUCTS_KEY,
      value: list as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("[custom-products] falha ao salvar", error);
    throw new Error("Não foi possível salvar o produto.");
  }
  applyCustomProducts(list);
}

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "produto"
  );
}

// ---------- leitura pública (loja) ----------
export const getPublicCustomProducts = createServerFn({ method: "GET" }).handler(
  async (): Promise<CustomProduct[]> => (await readAll()).filter((p) => p.active),
);

// ---------- painel ----------
export const listCustomProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomProduct[]> => {
    await assertAdmin(context.userId);
    return (await readAll()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });

const variantSchema = z.object({
  label: z.string().trim().min(1).max(40),
  image: z.string().url().max(2048),
});

const productSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(3, "Nome muito curto.").max(160),
  description: z.string().max(2000),
  price: z.number().int().min(100, "Preço mínimo R$ 1,00.").max(10_000_000),
  compareAt: z.number().int().min(0).max(10_000_000),
  days: z.number().int().min(0).max(3650),
  images: z.array(z.string().url().max(2048)).min(1, "Adicione pelo menos 1 foto.").max(5),
  features: z.array(z.string().trim().min(1).max(200)).max(20),
  sizes: z.array(z.string().trim().min(1).max(8)).max(20),
  variants: z.array(variantSchema).max(3),
});

export const saveCustomProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data, context }): Promise<CustomProduct> => {
    await assertAdmin(context.userId);
    const { BUILTIN_SLUGS } = await import("@/lib/catalog");
    const list = await readAll();
    const now = new Date().toISOString();
    const fields = {
      name: data.name,
      description: data.description.trim(),
      price: data.price,
      compareAt: data.compareAt > data.price ? data.compareAt : 0,
      days: data.days,
      images: data.images,
      features: data.features,
      sizes: data.sizes,
      variants: data.variants,
    };

    if (data.id) {
      const i = list.findIndex((p) => p.id === data.id);
      if (i < 0) throw new Error("Produto não encontrado.");
      const updated: CustomProduct = { ...list[i]!, ...fields, updatedAt: now };
      list[i] = updated;
      await writeAll(list);
      return updated;
    }

    const taken = new Set([...BUILTIN_SLUGS, ...list.map((p) => p.slug)]);
    const base = slugify(data.name);
    let slug = base;
    while (taken.has(slug)) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const created: CustomProduct = {
      id: crypto.randomUUID(),
      slug,
      ...fields,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await writeAll([created, ...list]);
    return created;
  });

const idSchema = z.object({ id: z.string().min(1).max(64) });

export const toggleCustomProductActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.extend({ active: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const list = await readAll();
    const p = list.find((x) => x.id === data.id);
    if (!p) throw new Error("Produto não encontrado.");
    p.active = data.active;
    p.updatedAt = new Date().toISOString();
    await writeAll(list);
    return { ok: true };
  });

export const deleteCustomProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const list = await readAll();
    await writeAll(list.filter((p) => p.id !== data.id));
    return { ok: true };
  });

// ---------- upload de foto ----------
const uploadSchema = z.object({
  fileName: z.string().max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(10).max(8_000_000), // ~6 MB depois de decodificado
});

export const uploadProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const db = await assertAdmin(context.userId);
    const { PRODUCT_IMAGES_BUCKET } = await import("./custom-products.server");
    // Cria o bucket público na primeira vez (ignora "já existe").
    const { data: bucket } = await db.storage.getBucket(PRODUCT_IMAGES_BUCKET);
    if (!bucket) {
      const { error } = await db.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
        public: true,
        fileSizeLimit: 6 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
      if (error && !/exist/i.test(error.message)) {
        console.error("[product-images] falha ao criar bucket", error);
        throw new Error("Não foi possível preparar o armazenamento de fotos.");
      }
    }
    const ext =
      data.contentType === "image/png" ? "png" : data.contentType === "image/webp" ? "webp" : "jpg";
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const { error } = await db.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, bytes, {
      contentType: data.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) {
      console.error("[product-images] falha no upload", error);
      throw new Error("Não foi possível enviar a foto.");
    }
    const { data: pub } = db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl };
  });

// ---------- texto com IA ----------
const descSchema = z.object({
  name: z.string().trim().min(3).max(160),
  hint: z.string().max(1000).optional(),
  style: z.enum(["short", "long"]),
});

export const generateProductDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => descSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; description: string; features: string[] } | { ok: false; error: string }
    > => {
      await assertAdmin(context.userId);
      const key = process.env.LOVABLE_API_KEY;
      if (!key)
        return { ok: false, error: "IA não configurada neste projeto (LOVABLE_API_KEY ausente)." };
      const style =
        data.style === "long"
          ? "DESCRIÇÃO LONGA E DETALHADA: 4 a 6 frases, foco em benefícios e modo de uso."
          : "DESCRIÇÃO CURTA E VENDEDORA: 2 a 3 frases.";
      const system = `Você escreve textos de venda em pt-BR para a byhappy, revendedora autorizada dos suplementos Happy Hair (cabelo, pele e unhas, colágeno, melatonina), com pagamento via PIX e frete grátis.
Responda SOMENTE com JSON no formato {"description": "...", "features": ["...", "..."]}.
- description: ${style}
- features: 4 a 6 benefícios curtos (até 80 caracteres cada).
Sem emojis. Não prometa cura nem resultados garantidos; não invente dados que não foram informados.`;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: `Produto: ${data.name}${data.hint ? `\nInformações: ${data.hint}` : ""}`,
              },
            ],
          }),
        });
        if (res.status === 429)
          return { ok: false, error: "Muitos pedidos à IA agora. Tente de novo em instantes." };
        if (res.status === 402) return { ok: false, error: "Sem créditos de IA no Lovable." };
        if (!res.ok) return { ok: false, error: `A IA respondeu com erro (${res.status}).` };
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = json.choices?.[0]?.message?.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        const parsed = match
          ? (JSON.parse(match[0]) as { description?: unknown; features?: unknown })
          : {};
        const description =
          typeof parsed.description === "string" ? parsed.description.trim().slice(0, 2000) : "";
        const features = Array.isArray(parsed.features)
          ? parsed.features
              .filter((f): f is string => typeof f === "string" && f.trim() !== "")
              .map((f) => f.trim().slice(0, 200))
              .slice(0, 6)
          : [];
        if (!description)
          return { ok: false, error: "A IA não devolveu um texto válido. Tente de novo." };
        return { ok: true, description, features };
      } catch (e) {
        console.error("[ai] falha ao gerar descrição", e);
        return { ok: false, error: "Não foi possível falar com a IA agora." };
      }
    },
  );

// ---------- importar produto por link ----------
const importSchema = z.object({ url: z.string().trim().url().max(2048) });

export type ImportedProduct = {
  name: string;
  description: string;
  images: string[];
  price: number; // centavos (0 = não encontrado)
  compareAt: number; // centavos (0 = não encontrado)
  features: string[];
};

/** Bloqueia endereços internos (localhost, IPs privados) — só páginas públicas. */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes("."))
    return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number) as [number, number];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
      return false;
  }
  if (h.startsWith("[") || h.includes(":")) return false; // IPv6 literal
  return true;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

const stripTags = (s: string) =>
  decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

/** "R$ 1.299,90" | "1299.90" | 1299.9 → centavos */
function priceToCents(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
  if (typeof v !== "string") return 0;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return "";
  return decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim();
}

function findJsonLdProduct(html: string): Record<string, unknown> | null {
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const f = visit(n);
        if (f) return f;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product")) || t === "ProductGroup")
      return o;
    return visit(o["@graph"]) ?? visit(o.mainEntity) ?? null;
  };
  for (const b of blocks) {
    try {
      const f = visit(JSON.parse(b[1]!.trim()));
      if (f) return f;
    } catch {
      /* JSON inválido — ignora */
    }
  }
  return null;
}

export const importProductFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; product: ImportedProduct } | { ok: false; error: string }> => {
      await assertAdmin(context.userId);
      if (!isPublicHttpUrl(data.url))
        return {
          ok: false,
          error: "Link inválido. Cole o endereço completo da página do produto.",
        };

      let html = "";
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12_000);
        const res = await fetch(data.url, {
          signal: ctrl.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
        });
        clearTimeout(timer);
        if (!res.ok)
          return {
            ok: false,
            error: `A página respondeu com erro (${res.status}). Confira o link.`,
          };
        const buf = await res.arrayBuffer();
        html = new TextDecoder("utf-8").decode(buf.slice(0, 3_000_000));
      } catch {
        return {
          ok: false,
          error:
            "Não consegui abrir esse link. Alguns sites bloqueiam a leitura — tente outro link ou preencha à mão.",
        };
      }

      const base = data.url;
      const abs = (u: string) => {
        try {
          const x = new URL(decodeEntities(u.trim()), base);
          return x.protocol === "https:" || x.protocol === "http:"
            ? x.toString().replace(/^http:/, "https:")
            : "";
        } catch {
          return "";
        }
      };

      const ld = findJsonLdProduct(html);
      const ldImages = (() => {
        const im = ld?.image;
        const list = Array.isArray(im) ? im : im ? [im] : [];
        return list
          .map((x) =>
            typeof x === "string"
              ? x
              : x && typeof x === "object"
                ? String((x as { url?: unknown }).url ?? "")
                : "",
          )
          .filter(Boolean);
      })();
      const offers = (() => {
        const of = ld?.offers;
        const first = Array.isArray(of) ? of[0] : of;
        return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
      })();

      const name =
        stripTags(String(ld?.name ?? "")) ||
        metaContent(html, "og:title") ||
        stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const description =
        stripTags(String(ld?.description ?? "")) ||
        metaContent(html, "og:description") ||
        metaContent(html, "description");
      const price =
        priceToCents(offers?.price) ||
        priceToCents(offers?.lowPrice) ||
        priceToCents(metaContent(html, "product:price:amount")) ||
        priceToCents(metaContent(html, "og:price:amount"));

      const imgs = [
        ...ldImages,
        metaContent(html, "og:image"),
        metaContent(html, "og:image:secure_url"),
        metaContent(html, "twitter:image"),
      ]
        .map(abs)
        .filter((u) => u && !/\.svg(\?|$)/i.test(u));
      const images = [...new Set(imgs)].slice(0, 5);

      if (!name && !images.length) {
        return {
          ok: false,
          error:
            "Não encontrei os dados do produto nessa página. Preencha à mão ou tente o link direto do produto.",
        };
      }
      return {
        ok: true,
        product: {
          name: name.slice(0, 160),
          description: description.slice(0, 2000),
          images,
          price,
          compareAt: 0,
          features: [],
        },
      };
    },
  );
