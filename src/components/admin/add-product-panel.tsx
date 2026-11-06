// Painel admin: adicionar produto novo na loja (copiado da aba "Adicionar produto" da Achadinhos da Manu).
// Sobe até 5 fotos pro bucket, salva o produto no banco e ele aparece na vitrine na hora.
import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUpAZ,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteCustomProduct,
  generateProductDescription,
  importProductFromUrl,
  listCustomProducts,
  saveCustomProduct,
  toggleCustomProductActive,
  uploadProductImage,
} from "@/lib/products-admin.functions";
import type { CustomProduct, CustomVariant } from "@/lib/catalog";
import { brl } from "@/lib/store";
import { logActivity } from "@/lib/audit";
import { toPageSlug } from "@/lib/store-paths";

const SIZES_PADRAO = ["PP", "P", "M", "G", "GG"] as const;
const MAX_PHOTOS = 5;
const MAX_COLORS = 3;
const QUERY_KEY = ["custom-products"];

/** Endereço público da página de venda do produto (o mesmo domínio do painel). */
const pageUrl = (slug: string) =>
  `${typeof window === "undefined" ? "https://planetamundo.shop" : window.location.origin}/${slug}`;
const shortUrl = (slug: string) => pageUrl(slug).replace(/^https?:\/\//, "");

async function copyLink(slug: string) {
  try {
    await navigator.clipboard.writeText(pageUrl(slug));
    toast.success("Link copiado! Cole no anúncio.");
  } catch {
    toast.error("Não consegui copiar. Segure o link para copiar.");
  }
}

/** "199,90" → 19990 centavos (NaN se inválido). */
function toCents(v: string): number {
  let s = v.trim().replace(/\s|R\$/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
const toInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "");

/** Reduz a foto (máx. 1200px, WebP) antes de subir — o público é 100% celular. */
async function compressImage(
  file: File,
): Promise<{ base64: string; contentType: "image/webp" | "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a foto.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const tryType = async (type: "image/webp" | "image/jpeg") =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
  let contentType: "image/webp" | "image/jpeg" = "image/webp";
  let blob = await tryType("image/webp");
  if (!blob || blob.type !== "image/webp") {
    contentType = "image/jpeg";
    blob = await tryType("image/jpeg");
  }
  if (!blob) throw new Error("Não foi possível processar a foto.");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), contentType };
}

async function uploadFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  const { base64, contentType } = await compressImage(file);
  const { url } = await uploadProductImage({ data: { fileName: file.name, contentType, base64 } });
  return url;
}

const isUrl = (s: string) => /^https:\/\/\S+$/i.test(s.trim());

type Mode = { kind: "list" } | { kind: "form"; editing: CustomProduct | null };

export function AddProductPanel() {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const list = useQuery({ queryKey: QUERY_KEY, queryFn: () => listCustomProducts() });

  if (mode.kind === "form") {
    return (
      <ProductForm
        editing={mode.editing}
        onDone={() => {
          void list.refetch();
          setMode({ kind: "list" });
        }}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Produtos criados aqui aparecem na vitrine da loja na hora e são cobrados no checkout PIX
          pelo preço cadastrado.
        </p>
        <Button
          onClick={() => setMode({ kind: "form", editing: null })}
          className="h-11 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-48" />
      ) : list.isError ? (
        <p className="rounded-lg border bg-card p-5 text-sm text-destructive">
          Não foi possível carregar os produtos.
        </p>
      ) : (
        <ProductList
          items={list.data ?? []}
          onEdit={(p) => setMode({ kind: "form", editing: p })}
          onChanged={() => void list.refetch()}
        />
      )}
    </div>
  );
}

function ProductList({
  items,
  onEdit,
  onChanged,
}: {
  items: CustomProduct[];
  onEdit: (p: CustomProduct) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "az" | "za">("recent");
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomProduct | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Nenhum produto adicionado ainda</p>
        <p className="mt-1">
          Clique em <b>Adicionar</b> pra publicar o primeiro.
        </p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const shown = items
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "az"
        ? a.name.localeCompare(b.name, "pt-BR")
        : sort === "za"
          ? b.name.localeCompare(a.name, "pt-BR")
          : a.createdAt < b.createdAt
            ? 1
            : -1,
    );

  async function toggle(p: CustomProduct) {
    setToggling(p.id);
    try {
      await toggleCustomProductActive({ data: { id: p.id, active: !p.active } });
      await logActivity(p.active ? "product.pause" : "product.activate");
      toast.success(
        p.active ? "Produto pausado — saiu da loja." : "Produto ativado — voltou pra loja.",
      );
      onChanged();
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar.");
    } finally {
      setToggling(null);
    }
  }

  async function remove(p: CustomProduct) {
    setDeleting(p.id);
    try {
      await deleteCustomProduct({ data: { id: p.id } });
      await logActivity("product.delete");
      toast.success("Produto excluído.");
      onChanged();
      await router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  const sortBtn = (key: typeof sort, label: string, icon?: React.ReactNode) => (
    <Button
      type="button"
      size="sm"
      variant={sort === key ? "default" : "outline"}
      onClick={() => setSort(key)}
      className="h-9"
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto pelo nome..."
            className="h-11 pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {sortBtn("recent", "Recentes")}
          {sortBtn("az", "A-Z", <ArrowDownAZ className="h-4 w-4" />)}
          {sortBtn("za", "Z-A", <ArrowUpAZ className="h-4 w-4" />)}
        </div>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-3 p-3">
            <img
              src={p.images[0]}
              alt=""
              width={56}
              height={56}
              className={`h-14 w-14 shrink-0 rounded-md border object-cover ${p.active ? "" : "opacity-50 grayscale"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{brl(p.price)}</span>
                {p.compareAt > p.price && <span className="line-through">{brl(p.compareAt)}</span>}
                <span>
                  · {p.images.length} foto{p.images.length === 1 ? "" : "s"}
                </span>
                {!p.active && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    Pausado
                  </span>
                )}
              </p>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
                <a
                  href={pageUrl(p.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-primary underline-offset-2 hover:underline"
                >
                  {shortUrl(p.slug)}
                </a>
                <button
                  type="button"
                  onClick={() => void copyLink(p.slug)}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold hover:bg-muted"
                  aria-label="Copiar link da página"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Editar"
                title="Editar"
                onClick={() => onEdit(p)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label={p.active ? "Pausar" : "Ativar"}
                title={p.active ? "Pausar (tirar da loja)" : "Ativar (voltar pra loja)"}
                disabled={toggling === p.id}
                onClick={() => void toggle(p)}
              >
                {toggling === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : p.active ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-destructive hover:text-destructive"
                aria-label="Excluir"
                title="Excluir"
                disabled={deleting === p.id}
                onClick={() => setConfirmDelete(p)}
              >
                {deleting === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            Nenhum produto com esse nome.
          </li>
        )}
      </ul>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" sai da loja e do carrinho das clientes. Pedidos já feitos não
              mudam. Se quiser só tirar da loja por um tempo, use o botão de pausar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) void remove(confirmDelete);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type Slot = { url: string; uploading: boolean };
type ColorRow = { label: string; image: string; uploading: boolean };

function ProductForm({
  editing,
  onDone,
  onCancel,
}: {
  editing: CustomProduct | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!editing);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const autoSlug = toPageSlug(name).slice(0, 50).replace(/-+$/g, "");
  const finalSlug = slugTouched ? toPageSlug(slug) : autoSlug;
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priceReais, setPriceReais] = useState(toInput(editing?.price ?? 0));
  const [oldPriceReais, setOldPriceReais] = useState(toInput(editing?.compareAt ?? 0));
  const [days, setDays] = useState(String(editing?.days ?? 30));
  const [features, setFeatures] = useState<string[]>(
    editing?.features.length ? editing.features : [""],
  );
  const [photos, setPhotos] = useState<Slot[]>(
    (editing?.images ?? []).map((url) => ({ url, uploading: false })),
  );
  const [photoUrl, setPhotoUrl] = useState("");
  const [hasSizes, setHasSizes] = useState(!!editing?.sizes.length);
  const [sizes, setSizes] = useState<string[]>(
    editing?.sizes.length ? editing.sizes : [...SIZES_PADRAO],
  );
  const [hasColors, setHasColors] = useState(!!editing?.variants.length);
  const [colors, setColors] = useState<ColorRow[]>(
    editing?.variants.length
      ? editing.variants.map((v) => ({ ...v, uploading: false }))
      : [{ label: "", image: "", uploading: false }],
  );
  const [aiBusy, setAiBusy] = useState<"short" | "long" | null>(null);
  const [saving, setSaving] = useState(false);
  const [singlePhotoWarn, setSinglePhotoWarn] = useState(false);
  const [published, setPublished] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  /** Cola o link de um produto (de qualquer loja) e preenche nome, descrição, preço e fotos. */
  async function importFromLink() {
    const u = importUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(u))
      return void toast.error("Cole o link completo do produto (começando com https://).");
    setImporting(true);
    try {
      const res = await importProductFromUrl({ data: { url: u } });
      if (!res.ok) return void toast.error(res.error);
      const p = res.product;
      if (p.name) setName(p.name);
      if (p.description) setDescription(p.description);
      if (p.price > 0) setPriceReais(toInput(p.price));
      if (p.compareAt > 0) setOldPriceReais(toInput(p.compareAt));
      if (p.images.length)
        setPhotos(p.images.slice(0, MAX_PHOTOS).map((url) => ({ url, uploading: false })));
      const found = [
        p.name && "nome",
        p.description && "descrição",
        p.price > 0 && "preço",
        p.images.length && `${p.images.length} foto(s)`,
      ].filter(Boolean);
      toast.success(`Importado: ${found.join(", ")}. Confira e ajuste antes de publicar.`);
      setImportUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível importar esse link.");
    } finally {
      setImporting(false);
    }
  }
  const fileRef = useRef<HTMLInputElement>(null);

  const price = toCents(priceReais);
  const oldPrice = oldPriceReais.trim() ? toCents(oldPriceReais) : 0;
  const off =
    Number.isFinite(price) && Number.isFinite(oldPrice) && oldPrice > price
      ? Math.round((1 - price / oldPrice) * 100)
      : 0;
  const anyUploading = photos.some((p) => p.uploading) || colors.some((c) => c.uploading);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const free = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, free);
    if (files.length > free)
      toast.warning(`Máximo de ${MAX_PHOTOS} fotos. Usei só as ${free} primeiras.`);
    for (const file of picked) {
      const tmp = URL.createObjectURL(file);
      setPhotos((p) => [...p, { url: tmp, uploading: true }]);
      try {
        const url = await uploadFile(file);
        setPhotos((p) => p.map((s) => (s.url === tmp ? { url, uploading: false } : s)));
      } catch (e) {
        setPhotos((p) => p.filter((s) => s.url !== tmp));
        toast.error(e instanceof Error ? e.message : "Falha ao enviar a foto.");
      } finally {
        URL.revokeObjectURL(tmp);
      }
    }
  }

  function addPhotoUrl() {
    const u = photoUrl.trim();
    if (!isUrl(u)) return void toast.error("Cole um link de imagem começando com https://");
    if (photos.length >= MAX_PHOTOS) return void toast.error(`Máximo de ${MAX_PHOTOS} fotos.`);
    setPhotos((p) => [...p, { url: u, uploading: false }]);
    setPhotoUrl("");
  }

  const movePhoto = (i: number, dir: -1 | 1) =>
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  async function uploadColorImage(i: number, file: File | undefined) {
    if (!file) return;
    setColors((c) => c.map((r, k) => (k === i ? { ...r, uploading: true } : r)));
    try {
      const url = await uploadFile(file);
      setColors((c) => c.map((r, k) => (k === i ? { ...r, image: url, uploading: false } : r)));
    } catch (e) {
      setColors((c) => c.map((r, k) => (k === i ? { ...r, uploading: false } : r)));
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a foto da cor.");
    }
  }

  async function generate(style: "short" | "long") {
    if (name.trim().length < 3) return void toast.error("Escreva o nome do produto primeiro.");
    setAiBusy(style);
    try {
      const res = await generateProductDescription({
        data: { name: name.trim(), hint: description.trim().slice(0, 1000) || undefined, style },
      });
      if (!res.ok) return void toast.error(res.error);
      setDescription(res.description);
      if (res.features.length) setFeatures(res.features);
      toast.success("Texto gerado! Revise antes de publicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o texto.");
    } finally {
      setAiBusy(null);
    }
  }

  function validate(): string | null {
    if (name.trim().length < 3) return "Dê um nome ao produto (mínimo 3 letras).";
    if (!Number.isFinite(price) || price < 100) return "Preço inválido. Use, por exemplo, 89,90.";
    if (!Number.isFinite(oldPrice) || oldPrice < 0) return 'Preço "de" inválido.';
    if (oldPrice > 0 && oldPrice <= price) return 'O preço "de" precisa ser maior que o preço.';
    if (!photos.length) return "Adicione pelo menos 1 foto.";
    if (anyUploading) return "Espere as fotos terminarem de subir.";
    if (hasSizes && !sizes.length)
      return "Escolha pelo menos 1 tamanho ou desligue a opção de tamanho.";
    if (hasColors) {
      const filled = colors.filter((c) => c.label.trim() || c.image);
      if (!filled.length) return "Preencha pelo menos 1 cor ou desligue a opção de cores.";
      if (filled.some((c) => !c.label.trim() || !c.image))
        return "Cada cor precisa de nome e foto.";
    }
    return null;
  }

  function submit() {
    const err = validate();
    if (err) return void toast.error(err);
    if (photos.length === 1) return setSinglePhotoWarn(true);
    void publish();
  }

  async function publish() {
    setSinglePhotoWarn(false);
    setSaving(true);
    try {
      const variants: CustomVariant[] = hasColors
        ? colors
            .filter((c) => c.label.trim() && c.image)
            .map((c) => ({ label: c.label.trim(), image: c.image }))
        : [];
      const saved = await saveCustomProduct({
        data: {
          id: editing?.id,
          name: name.trim(),
          description: description.trim(),
          price,
          compareAt: oldPrice,
          days: Math.max(0, Math.min(3650, Math.round(Number(days) || 0))),
          images: photos.map((p) => p.url),
          features: features.map((f) => f.trim()).filter(Boolean),
          sizes: hasSizes ? sizes : [],
          variants,
          slug: finalSlug || undefined,
        },
      });
      setSavedSlug(saved.slug);
      await logActivity(editing ? "product.update" : "product.create");
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
      await router.invalidate(); // atualiza a vitrine com o produto novo
      setPublished(true);
      toast.success(editing ? "Produto atualizado!" : "Produto publicado com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar.");
    } finally {
      setSaving(false);
    }
  }

  if (published) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-6 w-6" />
        </span>
        <p className="font-semibold">
          {editing ? "Produto atualizado!" : "Produto publicado com sucesso!"}
        </p>
        <p className="text-sm text-muted-foreground">
          Ele já aparece na loja e tem página própria de venda:
        </p>
        {savedSlug && (
          <div className="w-full space-y-2">
            <a
              href={pageUrl(savedSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-1.5 truncate rounded-md border bg-muted px-3 text-sm font-semibold text-primary"
            >
              {shortUrl(savedSlug)} <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
            <Button type="button" className="h-11 w-full" onClick={() => void copyLink(savedSlug)}>
              <Copy className="h-4 w-4" /> Copiar link para o anúncio
            </Button>
          </div>
        )}
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onDone}>
          Voltar para a lista
        </Button>
      </div>
    );
  }

  const label = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para a lista
      </button>

      {/* Importar por link */}
      <section className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Link2 className="h-4 w-4" /> Adicionar com link
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Cole o link da página do produto (ex.: site da Happy Hair) e eu preencho nome, descrição,
          preço e fotos.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void importFromLink();
              }
            }}
            inputMode="url"
            placeholder="https://www.happyhair.com.br/products/..."
            className="h-11"
          />
          <Button
            type="button"
            className="h-11 shrink-0"
            disabled={importing}
            onClick={() => void importFromLink()}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {importing ? "Buscando..." : "Buscar produto"}
          </Button>
        </div>
      </section>

      {/* Fotos */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">
          Fotos ({photos.length}/{MAX_PHOTOS})
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          A primeira foto é a capa na loja. Use as setas para mudar a ordem.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p, i) => (
            <div
              key={p.url + i}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              {p.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  Capa
                </span>
              )}
              {!p.uploading && (
                <>
                  <button
                    type="button"
                    aria-label="Remover foto"
                    onClick={() => setPhotos((s) => s.filter((_, k) => k !== i))}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute inset-x-1 bottom-1 flex justify-between">
                    <button
                      type="button"
                      aria-label="Mover para a esquerda"
                      disabled={i === 0}
                      onClick={() => movePhoto(i, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mover para a direita"
                      disabled={i === photos.length - 1}
                      onClick={() => movePhoto(i, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              <ImagePlus className="h-6 w-6" />
              Adicionar
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {photos.length < MAX_PHOTOS && (
          <div className="mt-3 flex gap-2">
            <Input
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="Ou cole o link da imagem (https://...)"
              className="h-11"
            />
            <Button type="button" variant="outline" className="h-11 shrink-0" onClick={addPhotoUrl}>
              <Link2 className="h-4 w-4" /> Por URL
            </Button>
          </div>
        )}
      </section>

      {/* Dados */}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <label className="block">
          <span className={label}>Nome do produto</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            placeholder="Ex.: Kit Happy Hair 4 Potes + Colágeno Grátis"
            className="h-11"
          />
        </label>
        <label className="block">
          <span className={label}>Link da página de venda (use no anúncio)</span>
          <div className="flex h-11 items-center overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
            <span className="shrink-0 pl-3 text-sm text-muted-foreground">
              {shortUrl("").replace(/\/$/, "")}/
            </span>
            <input
              value={slugTouched ? slug : autoSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              onBlur={() => setSlug((v) => toPageSlug(v))}
              maxLength={60}
              inputMode="url"
              autoCapitalize="none"
              placeholder="biotina"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm font-semibold outline-none"
            />
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Só letras, números e hífen. Ex.: biotina, kit-3-potes. Quem clicar no anúncio cai direto
            neste produto.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={label}>Preço no PIX (R$)</span>
            <Input
              inputMode="decimal"
              value={priceReais}
              onChange={(e) => setPriceReais(e.target.value)}
              placeholder="89,90"
              className="h-11"
            />
          </label>
          <label className="block">
            <span className={label}>Preço "de" (R$, riscado)</span>
            <Input
              inputMode="decimal"
              value={oldPriceReais}
              onChange={(e) => setOldPriceReais(e.target.value)}
              placeholder="299,90"
              className="h-11"
            />
          </label>
          <label className="col-span-2 block sm:col-span-1">
            <span className={label}>Duração do tratamento (dias)</span>
            <Input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
              placeholder="30"
              className="h-11"
            />
          </label>
        </div>
        {off > 0 && (
          <p className="text-xs font-semibold text-success">Mostra -{off}% de desconto na loja.</p>
        )}

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className={label + " mb-0"}>Descrição</span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!!aiBusy}
                onClick={() => void generate("short")}
                className="h-9"
              >
                {aiBusy === "short" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}{" "}
                Curta
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!!aiBusy}
                onClick={() => void generate("long")}
                className="h-9"
              >
                {aiBusy === "long" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}{" "}
                Longa
              </Button>
            </div>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Descreva o produto (ou use a IA para gerar o texto)."
          />
        </div>
      </section>

      {/* Características */}
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Características (bullet points)</h2>
        {features.map((f, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={f}
              maxLength={200}
              onChange={(e) => setFeatures((s) => s.map((x, k) => (k === i ? e.target.value : x)))}
              placeholder="Ex.: Fortalece os fios desde a raiz"
              className="h-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label="Remover característica"
              onClick={() =>
                setFeatures((s) => (s.length > 1 ? s.filter((_, k) => k !== i) : [""]))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {features.length < 20 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => setFeatures((s) => [...s, ""])}
          >
            <Plus className="h-4 w-4" /> Adicionar característica
          </Button>
        )}
      </section>

      {/* Variações */}
      <section className="space-y-4 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Variações</h2>
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">Tem tamanho (roupa)</span>
            <Switch checked={hasSizes} onCheckedChange={setHasSizes} />
          </label>
          {hasSizes && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Tamanhos padrão: {SIZES_PADRAO.join(", ")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SIZES_PADRAO.map((s) => {
                  const on = sizes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setSizes((cur) =>
                          on
                            ? cur.filter((x) => x !== s)
                            : SIZES_PADRAO.filter((x) => cur.includes(x) || x === s),
                        )
                      }
                      className={`h-10 min-w-12 rounded-md border px-3 text-sm font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm">Tem cores (até {MAX_COLORS})</span>
            <Switch checked={hasColors} onCheckedChange={setHasColors} />
          </label>
          {hasColors && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Cores disponíveis (até {MAX_COLORS}) — nome e foto de cada uma.
              </p>
              {colors.map((c, i) => (
                <ColorEditor
                  key={i}
                  row={c}
                  onLabel={(v) =>
                    setColors((s) => s.map((r, k) => (k === i ? { ...r, label: v } : r)))
                  }
                  onImageUrl={(v) =>
                    setColors((s) => s.map((r, k) => (k === i ? { ...r, image: v } : r)))
                  }
                  onFile={(f) => void uploadColorImage(i, f)}
                  onRemove={() =>
                    setColors((s) =>
                      s.length > 1
                        ? s.filter((_, k) => k !== i)
                        : [{ label: "", image: "", uploading: false }],
                    )
                  }
                />
              ))}
              {colors.length < MAX_COLORS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() =>
                    setColors((s) => [...s, { label: "", image: "", uploading: false }])
                  }
                >
                  <Plus className="h-4 w-4" /> Adicionar cor
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Ações fixas no rodapé (celular) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-12 flex-[2]"
            onClick={submit}
            disabled={saving || anyUploading}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Publicando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> {editing ? "Salvar alterações" : "Publicar produto"}
              </>
            )}
          </Button>
        </div>
      </div>

      <SinglePhotoWarning
        open={singlePhotoWarn}
        productName={name}
        imageUrl={photos[0]?.url}
        busy={saving}
        onConfirm={() => void publish()}
        onCancel={() => setSinglePhotoWarn(false)}
      />
    </div>
  );
}

function ColorEditor({
  row,
  onLabel,
  onImageUrl,
  onFile,
  onRemove,
}: {
  row: ColorRow;
  onLabel: (v: string) => void;
  onImageUrl: (v: string) => void;
  onFile: (f: File | undefined) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-muted text-muted-foreground"
        aria-label="Foto da cor"
      >
        {row.image ? (
          <img src={row.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5" />
        )}
        {row.uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Input
          value={row.label}
          maxLength={40}
          onChange={(e) => onLabel(e.target.value)}
          placeholder="Nome da cor (ex.: Rosa)"
          className="h-10"
        />
        <div className="flex gap-2">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Ou link da foto (https://...)"
            className="h-10"
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0"
            onClick={() => {
              if (!isUrl(urlDraft)) return void toast.error("Cole um link começando com https://");
              onImageUrl(urlDraft.trim());
              setUrlDraft("");
            }}
          >
            Por URL
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 self-end sm:self-center"
        aria-label="Remover cor"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Aviso antes de publicar com 1 foto só — produtos com mais fotos vendem mais. */
function SinglePhotoWarning({
  open,
  productName,
  imageUrl,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  productName: string;
  imageUrl?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <AlertDialogTitle className="text-center">Só 1 foto?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Produtos com mais fotos vendem mais. Que tal mostrar o pote de perto, o rótulo e o kit
            completo?
          </AlertDialogDescription>
        </AlertDialogHeader>
        {imageUrl && (
          <div className="flex items-center gap-3 rounded-md border p-2">
            <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
            <p className="line-clamp-2 text-sm font-medium">{productName || "Produto sem nome"}</p>
          </div>
        )}
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <AlertDialogCancel className="h-11 w-full">
            <ArrowLeft className="h-4 w-4" /> Adicionar mais fotos
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-11 w-full"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
            Publicar assim mesmo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
