/** Catálogo da byhappy — produtos Happy Hair (valores em centavos). */
export interface Product {
  slug: string;
  name: string;
  price: number;
  compareAt: number;
  image: string;
  /** Duração do tratamento em dias. */
  days: number;
}

export const PRODUCTS: Product[] = [
  // Kits — foco principal da loja
  { slug: "happy-hair-2-potes", name: "Kit Happy Hair 2 Potes", price: 6999, compareAt: 19999, days: 60, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/2_Happy_Hair.jpg?v=1757894585" },
  { slug: "happy-hair-3-potes-colageno-gratis", name: "Kit Happy Hair 3 Potes + 1 Colágeno Grátis", price: 9999, compareAt: 29999, days: 90, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3_Happy_Hair_1_Colageno.jpg?v=1757894133" },
  { slug: "happy-hair-7-potes", name: "Kit Happy Hair 3 Potes + 2 Grátis + Melatonina + Colágeno (7 Potes)", price: 19999, compareAt: 64995, days: 150, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3-happy-hair-4-brindes.jpg?v=1770604954" },
  { slug: "happy-hair-15-potes", name: "Kit Happy Hair 6 Potes + 6 Grátis + 2 Colágenos + 1 Melatonina (15 Potes)", price: 10990, compareAt: 119991, days: 360, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/6_Happy_Hair_6_Happy_Hair_gratis_2_Colageno_1_Melatonina.jpg?v=1757894740" },
  // Avulsos — todos a R$ 39,90
  { slug: "happy-hair-1-pote", name: "Happy Hair 1 Pote", price: 3990, compareAt: 16990, days: 30, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1_Pote_Happy_Hair_76ad2494-4fe2-4f99-91ec-8b8680f538fd.jpg?v=1757895234" },
  { slug: "melatonina-happy-sleep", name: "Melatonina Happy Sleep 1 Pote", price: 3990, compareAt: 9999, days: 30, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-melatonina-happy-sleep.webp?v=1743379968" },
  { slug: "colageno-happy-collagen", name: "Colágeno com Ácido Hialurônico 1 Pote", price: 3990, compareAt: 11999, days: 30, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-colageno-happy_collagen.webp?v=1743380419" },
  { slug: "creatina-happy-creatine", name: "Creatina Monohidratada 100% Pura 300g", price: 3990, compareAt: 16999, days: 30, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-creatina-300g-1-happy-hair-happy-creatine_206fcc43-c316-4838-875b-7c3b105ee92d.webp?v=1743379787" },
];

export const findProduct = (slug: string): Product | undefined => PRODUCTS.find((p) => p.slug === slug);

/** Kits são os combos — foco principal da loja. */
export const isKit = (p: Product): boolean => p.slug.includes("kit") || p.name.startsWith("Kit");
export const KITS: Product[] = PRODUCTS.filter(isKit);
export const AVULSOS: Product[] = PRODUCTS.filter((p) => !isKit(p));
