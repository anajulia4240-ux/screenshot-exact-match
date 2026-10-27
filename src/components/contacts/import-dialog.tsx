import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser, useLists, useTags } from "@/hooks/use-catalog";
import { logActivity } from "@/lib/audit";
import { downloadCsv, formatPhone } from "@/lib/contacts";
import {
  buildRecords,
  guessMapping,
  parseFile,
  runImport,
  TARGET_LABEL,
  type ImportResult,
  type ParsedFile,
  type TargetField,
} from "@/lib/import";

type Step = "upload" | "map" | "options" | "running" | "done";
const NONE = "__none__";

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const lists = useLists();
  const tags = useTags();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<TargetField[]>([]);
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<"skip" | "update">("skip");
  const [allowEmail, setAllowEmail] = useState(false);
  const [allowWhatsapp, setAllowWhatsapp] = useState(false);
  const [consentSource, setConsentSource] = useState("");
  const [defaultSource, setDefaultSource] = useState("");
  const [listId, setListId] = useState<string>(NONE);
  const [tagId, setTagId] = useState<string>(NONE);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const staticLists = (lists.data ?? []).filter((l) => l.kind === "static");
  const built = useMemo(() => (parsed ? buildRecords(parsed, mapping) : null), [parsed, mapping]);
  const hasContactColumn = mapping.includes("email") || mapping.includes("phone");

  function reset() {
    setStep("upload");
    setParsed(null);
    setMapping([]);
    setResult(null);
    setProgress(0);
    setFileName("");
    setAllowEmail(false);
    setAllowWhatsapp(false);
    setConsentSource("");
    setListId(NONE);
    setTagId(NONE);
    setDuplicates("skip");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo maior que 20 MB. Divida a planilha em partes.");
      return;
    }
    setLoading(true);
    try {
      const p = await parseFile(file);
      setParsed(p);
      setMapping(guessMapping(p.headers));
      setFileName(file.name);
      setDefaultSource(`Importação: ${file.name}`);
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (!built || !me.data) return;
    if ((allowEmail || allowWhatsapp) && !consentSource.trim()) {
      toast.error("Informe como o consentimento foi obtido.");
      return;
    }
    setStep("running");
    try {
      const res = await runImport(
        built.records,
        {
          duplicates,
          defaultSource: defaultSource.trim(),
          allowEmail,
          allowWhatsapp,
          consentSource: consentSource.trim(),
          listId: listId === NONE ? null : listId,
          tagIds: tagId === NONE ? [] : [tagId],
          userId: me.data.id,
        },
        built.rejected,
        setProgress,
      );
      setResult(res);
      setStep("done");
      await logActivity("contacts.import", {
        file: fileName,
        created: res.created,
        updated: res.updated,
        unchanged: res.unchanged,
        rejected: res.rejected.length,
      });
      ["contacts", "tags", "lists", "list-counts", "dashboard-stats"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na importação.");
      setStep("options");
    }
  }

  const total = parsed?.rows.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (step === "running") return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar contatos</DialogTitle>
          <DialogDescription>
            {step === "upload" &&
              "Envie uma planilha .csv ou .xlsx. A primeira linha deve ter os nomes das colunas."}
            {step === "map" &&
              `${fileName} · ${total.toLocaleString("pt-BR")} linhas. Diga o que cada coluna significa.`}
            {step === "options" && "Defina como tratar duplicados, consentimento e organização."}
            {step === "running" && "Importando… não feche esta janela."}
            {step === "done" && "Importação concluída."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center hover:bg-accent/40">
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <FileSpreadsheet className="h-8 w-8 text-primary" />
            )}
            <span className="text-sm font-medium">Clique para escolher o arquivo</span>
            <span className="text-xs text-muted-foreground">
              CSV (vírgula ou ponto e vírgula) ou Excel .xlsx · até 20 MB
            </span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        )}

        {step === "map" && parsed && (
          <div className="grid gap-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Coluna da planilha</th>
                    <th className="p-2 font-medium">Exemplo</th>
                    <th className="w-56 p-2 font-medium">Importar como</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.headers.map((h, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium">{h}</td>
                      <td className="max-w-[220px] truncate p-2 text-muted-foreground">
                        {parsed.rows.find((r) => r[i])?.[i] ?? "—"}
                      </td>
                      <td className="p-2">
                        <Select
                          value={mapping[i] ?? "ignore"}
                          onValueChange={(v) =>
                            setMapping((m) => m.map((x, j) => (j === i ? (v as TargetField) : x)))
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(TARGET_LABEL) as TargetField[]).map((f) => (
                              <SelectItem key={f} value={f}>
                                {TARGET_LABEL[f]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasContactColumn && (
              <p className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" /> Marque pelo menos uma coluna como E-mail ou
                Telefone.
              </p>
            )}
            {built && hasContactColumn && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Prévia (primeiras 5 linhas válidas)
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="p-2">Nome</th>
                        <th className="p-2">E-mail</th>
                        <th className="p-2">Telefone</th>
                        <th className="p-2">Empresa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {built.records.slice(0, 5).map((r) => (
                        <tr key={r.line}>
                          <td className="p-2">{r.full_name ?? "—"}</td>
                          <td
                            className={`p-2 ${r.email && !r.email_valid ? "text-amber-600" : ""}`}
                          >
                            {r.email ?? "—"}
                          </td>
                          <td
                            className={`p-2 ${r.phone && !r.phone_valid ? "text-amber-600" : ""}`}
                          >
                            {formatPhone(r.phone) || "—"}
                          </td>
                          <td className="p-2">{r.company ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {built.records.length.toLocaleString("pt-BR")} linhas prontas
                  {built.rejected.length > 0 &&
                    ` · ${built.rejected.length.toLocaleString("pt-BR")} sem e-mail nem telefone (serão ignoradas)`}
                  {" · "}em laranja: dado fora do padrão, importado mas marcado como inválido.
                </p>
              </div>
            )}
          </div>
        )}

        {step === "options" && (
          <div className="grid gap-5">
            <div>
              <Label className="text-sm">Se o contato já existir (mesmo e-mail ou telefone)</Label>
              <RadioGroup
                value={duplicates}
                onValueChange={(v) => setDuplicates(v as "skip" | "update")}
                className="mt-2 grid gap-2"
              >
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="skip" className="mt-0.5" />
                  <span>
                    <b>Manter como está</b> — não altera os dados do contato existente.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value="update" className="mt-0.5" />
                  <span>
                    <b>Atualizar</b> — preenche nome, empresa e campos com os valores da planilha.
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Consentimento</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Marque apenas se todos os contatos desta planilha autorizaram receber mensagens. A
                importação nunca remove consentimentos já existentes.
              </p>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowEmail}
                    onCheckedChange={(v) => setAllowEmail(v === true)}
                  />{" "}
                  Aceitam e-mail
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowWhatsapp}
                    onCheckedChange={(v) => setAllowWhatsapp(v === true)}
                  />{" "}
                  Aceitam WhatsApp
                </label>
              </div>
              {(allowEmail || allowWhatsapp) && (
                <Input
                  className="mt-3"
                  value={consentSource}
                  onChange={(e) => setConsentSource(e.target.value)}
                  placeholder="Como foi obtido? Ex.: compradores da loja que marcaram receber novidades"
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-sm">Origem (se a planilha não tiver)</Label>
                <Input value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm">Adicionar à lista</Label>
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {staticLists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm">Aplicar tag</Label>
                <Select value={tagId} onValueChange={setTagId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {(tags.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === "running" && (
          <div className="grid gap-2 py-6">
            <Progress
              value={total ? (progress / Math.max(built?.records.length ?? 1, 1)) * 100 : 0}
            />
            <p className="text-center text-sm text-muted-foreground">
              {progress.toLocaleString("pt-BR")} de{" "}
              {(built?.records.length ?? 0).toLocaleString("pt-BR")} processados
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5" /> Pronto!
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Novos" value={result.created} />
              <Stat label="Atualizados" value={result.updated} />
              <Stat label="Já existiam (sem mudança)" value={result.unchanged} />
              <Stat label="Repetidos na planilha" value={result.duplicatesInFile} />
            </div>
            {result.rejected.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <span>
                  {result.rejected.length.toLocaleString("pt-BR")} linhas não foram importadas.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadCsv("linhas-nao-importadas.csv", [
                      ["Linha", "Motivo", ...(parsed?.headers ?? [])],
                      ...result.rejected.map((r) => [r.line, r.reason, ...r.raw]),
                    ])
                  }
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar relatório
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Contatos que já existiam também foram adicionados à lista e à tag escolhidas.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={reset}>
                Trocar arquivo
              </Button>
              <Button
                disabled={!hasContactColumn || !built?.records.length}
                onClick={() => setStep("options")}
              >
                Continuar
              </Button>
            </>
          )}
          {step === "options" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")}>
                Voltar
              </Button>
              <Button onClick={start}>
                <Upload className="mr-2 h-4 w-4" /> Importar{" "}
                {built?.records.length.toLocaleString("pt-BR")} contatos
              </Button>
            </>
          )}
          {step === "done" && (
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}
