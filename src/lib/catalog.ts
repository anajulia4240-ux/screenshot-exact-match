/** Catálogo da byhappy — mesmos produtos e preços oficiais Happy Hair (valores em centavos). */
export interface Product {
  slug: string;
  name: string;
  price: number;
  compareAt: number;
  image: string;
}

export const PRODUCTS: Product[] = [
  { slug: "happy-hair-2-potes-1-calm-gratis-1-colageno-gratis", name: "Happy Hair 2 Potes + 1 Calm Grátis + 1 Colágeno Grátis", price: 11999, compareAt: 39699, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/calm_2.jpg?v=1774959067" },
  { slug: "happy-hair-3-potes-colageno-1-pote-gratis", name: "Happy Hair 3 Potes + 1 Colágeno Grátis", price: 9999, compareAt: 29999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3_Happy_Hair_1_Colageno.jpg?v=1757894133" },
  { slug: "happy-hair-3-potes-2-potes-gratis-1-pote-de-melatonina-1-pote-de-colageno-total-7-potes", name: "Happy Hair 3 Potes + 2 Potes Grátis + 1 Pote de Melatonina + 1 Pote de Colágeno (Total 7 Potes)", price: 19999, compareAt: 64995, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3-happy-hair-4-brindes.jpg?v=1770604954" },
  { slug: "happy-hair-2-potes-1-melatonina-gratis-1-colageno-gratis", name: "Happy Hair 2 Potes + 1 Melatonina Grátis + 1 Colágeno Grátis", price: 8999, compareAt: 39699, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/2_Happy_Hair_1_Collageno_1_Melatonina.jpg?v=1757894004" },
  { slug: "happy-hair-3-potes-1-melatonina-gratis", name: "Happy Hair 3 Potes + 1 Melatonina Grátis", price: 7999, compareAt: 29999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3_Happy_Hair_1_Melatonina.jpg?v=1757894082" },
  { slug: "creatina-monohidratada-100-pura-500g-happy-creatine", name: "Creatina Monohidratada 100% Pura 500g Happy Creatine", price: 5999, compareAt: 16999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-creatina-500g-happy-creatine.webp?v=1743379411" },
  { slug: "creatina-100-pura-300g-happy-hair", name: "Creatina 100% pura 300g + 1 Happy Hair", price: 11999, compareAt: 25998, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/Creatina__2B_pote_junto.jpg?v=1736203928" },
  { slug: "1-pote-happy-calm", name: "1 Pote Happy Calm", price: 8999, compareAt: 19999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-happy-calm.webp?v=1743379626" },
  { slug: "creatina-monohidratada-100-pura", name: "Creatina Monohidratada 100% Pura 300g - Happy Creatine", price: 4999, compareAt: 16999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-creatina-300g-1-happy-hair-happy-creatine_206fcc43-c316-4838-875b-7c3b105ee92d.webp?v=1743379787" },
  { slug: "melatonina-happy-sleep-2-potes", name: "Melatonina Happy Sleep 2 Potes", price: 6999, compareAt: 19999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/2-melatonina.webp?v=1743379707" },
  { slug: "happy-collagen-2-potes", name: "Happy Collagen 2 Potes", price: 6999, compareAt: 19999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/2-colageno-happy-collagen.webp?v=1743379748" },
  { slug: "happy-hair-1-pote-happy-sleep-melatonina-1-pote", name: "Happy Hair 1 Pote + Happy Sleep (Melatonina) 1 Pote", price: 7999, compareAt: 19999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1_melatonina_1_Happy_Hair.jpg?v=1757894508" },
  { slug: "happy-hair-2-potes", name: "Happy Hair 2 Potes", price: 6999, compareAt: 19999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/2_Happy_Hair.jpg?v=1757894585" },
  { slug: "1-pote-happy-hair-1-pote-happy-hair-gratis-total-2-potes", name: "1 Pote Happy Hair + 1 Pote Happy Hair Grátis (Total: 2 Potes)", price: 6999, compareAt: 9999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/2_Happy_Hair.jpg?v=1757894585" },
  { slug: "melatonina-happy-sleep", name: "Melatonina Happy Sleep - 1 Pote (30 dias de uso)", price: 4999, compareAt: 9999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-melatonina-happy-sleep.webp?v=1743379968" },
  { slug: "happy-hair-6-potes-6-potes-gratis-2-colagenos-1-melatonina-total-15-potes", name: "Happy Hair 6 Potes + 6 Potes Grátis + 2 Colágenos + 1 Melatonina (Total 15 Potes)", price: 29999, compareAt: 119991, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/6_Happy_Hair_6_Happy_Hair_gratis_2_Colageno_1_Melatonina.jpg?v=1757894740" },
  { slug: "happy-hair-3-potes-3-potes-gratis-2-potes-de-colageno-total-8-potes-1", name: "Happy Hair 3 Potes + 3 Potes Grátis + 2 Potes de Colágeno (Total 8 Potes)", price: 19999, compareAt: 64995, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/Happy_Hair_3_Potes_3_Happy_Hair_Gratis_2_Potes_de_Colageno.jpg?v=1757894817" },
  { slug: "happy-hair-6-potes-6-potes-gratis-1-melatonina-1-colageno-1-happy-calm-total-15-potes", name: "Happy Hair 6 Potes + 6 Potes Grátis + 1 Melatonina + 1 Colágeno + 1 Happy Calm (Total 15 Potes)", price: 29999, compareAt: 199991, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/6_Happy_Hair_6_Happy_Hair_gratis_3_Potes.jpg?v=1757894903" },
  { slug: "happy-hair-3-potes-3-potes-gratis-1-pote-de-melatonina-1-pote-de-colageno-total-8-potes", name: "Happy Hair 3 Potes + 3 Potes Grátis + 1 Pote de Melatonina + 1 Pote de Colágeno (Total 8 Potes)", price: 19999, compareAt: 64995, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/Happy_Hair_3_Potes_3_Happy_Hair_Gratis_1_Pote_de_Melatonina_gratis_1_Pote_de_Colageno_gratis.jpg?v=1757895023" },
  { slug: "happy-hair-6-potes-6-potes-gratis-1-melatonina-1-colageno-happy-calm-total-15-potes", name: "Happy Hair 6 Potes + 6 Potes Grátis + 2 Colágenos + 1 Happy Calm (Total 15 Potes)", price: 29999, compareAt: 119991, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/6_Potes_Happy_Hair_6_Happy_Hair_Gratis_3_Potes.jpg?v=1757895117" },
  { slug: "happy-hair-3-potes-1", name: "Happy Hair 3 Potes", price: 11999, compareAt: 29999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3_Potes_Happy_Hair_2e936d4e-8493-441e-9f35-22b557ee2632.jpg?v=1757895185" },
  { slug: "1-pote-colageno-com-acido-hialuronico", name: "1 Pote Colágeno Com Ácido Hialurônico", price: 4999, compareAt: 11999, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1-colageno-happy_collagen.webp?v=1743380419" },
  { slug: "happy-hair-1-pote", name: "Happy Hair 1 Pote", price: 7499, compareAt: 16990, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/1_Pote_Happy_Hair_76ad2494-4fe2-4f99-91ec-8b8680f538fd.jpg?v=1757895234" },
  { slug: "happy-hair-3-potes", name: "Happy Hair 3 Potes + 3 Potes Grátis (Total 6 Potes)", price: 19999, compareAt: 44997, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/3_Happy_Hair_3_Happy_Hair_gratis.jpg?v=1757895288" },
  { slug: "happy-hair-6-potes", name: "Happy Hair 6 Potes + 6 Potes Grátis (Total 12 Potes)", price: 29999, compareAt: 89994, image: "https://cdn.shopify.com/s/files/1/0556/0139/7873/files/6_Happy_Hair_6_Happy_Hair_gratis.jpg?v=1757895434" },
];

export const findProduct = (slug: string): Product | undefined => PRODUCTS.find((p) => p.slug === slug);
