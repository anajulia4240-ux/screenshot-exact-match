import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABEL, STATUSES } from "@/lib/contacts";
import { FIELD_LABEL, type SegmentCondition, type SegmentRules } from "@/lib/segments";

type Opt = { value: string; label: string };

const OPS: Record<SegmentCondition["field"], Opt[]> = {
  status: [
    { value: "eq", label: "é" },
    { value: "neq", label: "não é" },
  ],
  tag: [
    { value: "has", label: "tem" },
    { value: "not_has", label: "não tem" },
  ],
  list: [
    { value: "in", label: "está na" },
    { value: "not_in", label: "não está na" },
  ],
  allow_email: [{ value: "is", label: "=" }],
  allow_whatsapp: [{ value: "is", label: "=" }],
  email_valid: [{ value: "is", label: "=" }],
  phone_valid: [{ value: "is", label: "=" }],
  has_email: [{ value: "is", label: "=" }],
  has_phone: [{ value: "is", label: "=" }],
  source: [
    { value: "contains", label: "contém" },
    { value: "eq", label: "é exatamente" },
  ],
  company: [
    { value: "contains", label: "contém" },
    { value: "eq", label: "é exatamente" },
  ],
  email: [
    { value: "contains", label: "contém" },
    { value: "eq", label: "é exatamente" },
  ],
  created_at: [
    { value: "after", label: "a partir de" },
    { value: "before", label: "antes de" },
  ],
};

function defaultCondition(
  field: SegmentCondition["field"],
  tags: Opt[],
  lists: Opt[],
): SegmentCondition {
  switch (field) {
    case "status":
      return { field, op: "eq", value: "active" };
    case "tag":
      return { field, op: "has", value: tags[0]?.value ?? "" };
    case "list":
      return { field, op: "in", value: lists[0]?.value ?? "" };
    case "source":
    case "company":
    case "email":
      return { field, op: "contains", value: "" };
    case "created_at":
      return { field, op: "after", value: new Date().toISOString().slice(0, 10) };
    default:
      return { field, op: "is", value: true };
  }
}

export function SegmentBuilder({
  rules,
  onChange,
  tags,
  lists,
}: {
  rules: SegmentRules;
  onChange: (r: SegmentRules) => void;
  tags: Opt[];
  lists: Opt[];
}) {
  const update = (i: number, c: SegmentCondition) =>
    onChange({ ...rules, conditions: rules.conditions.map((x, j) => (j === i ? c : x)) });
  const remove = (i: number) =>
    onChange({ ...rules, conditions: rules.conditions.filter((_, j) => j !== i) });

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Contatos que atendem a <b>todas</b> as condições abaixo. O segmento se atualiza sozinho
        conforme os contatos mudam.
      </p>
      {rules.conditions.map((c, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2"
        >
          <Select
            value={c.field}
            onValueChange={(f) =>
              update(i, defaultCondition(f as SegmentCondition["field"], tags, lists))
            }
          >
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FIELD_LABEL) as SegmentCondition["field"][]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FIELD_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {OPS[c.field].length > 1 && (
            <Select
              value={c.op}
              onValueChange={(op) => update(i, { ...c, op } as SegmentCondition)}
            >
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS[c.field].map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ValueInput
            c={c}
            onChange={(v) => update(i, { ...c, value: v } as SegmentCondition)}
            tags={tags}
            lists={lists}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto h-8 w-8"
            aria-label="Remover condição"
            onClick={() => remove(i)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() =>
          onChange({
            ...rules,
            conditions: [...rules.conditions, defaultCondition("status", tags, lists)],
          })
        }
      >
        <Plus className="mr-1 h-4 w-4" /> Adicionar condição
      </Button>
      <label className="mt-1 flex items-center gap-2 text-sm">
        <Switch
          checked={rules.excludeOptedOut}
          onCheckedChange={(v) => onChange({ ...rules, excludeOptedOut: v })}
        />
        Excluir descadastrados, bloqueados e e-mails rejeitados
      </label>
    </div>
  );
}

function ValueInput({
  c,
  onChange,
  tags,
  lists,
}: {
  c: SegmentCondition;
  onChange: (v: string | boolean) => void;
  tags: Opt[];
  lists: Opt[];
}) {
  if (c.field === "status")
    return (
      <SimpleSelect
        value={c.value}
        onChange={onChange}
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
      />
    );
  if (c.field === "tag")
    return tags.length ? (
      <SimpleSelect value={c.value} onChange={onChange} options={tags} />
    ) : (
      <span className="text-xs text-muted-foreground">Nenhuma tag criada</span>
    );
  if (c.field === "list")
    return lists.length ? (
      <SimpleSelect value={c.value} onChange={onChange} options={lists} />
    ) : (
      <span className="text-xs text-muted-foreground">Nenhuma lista estática</span>
    );
  if (c.field === "created_at")
    return (
      <Input
        type="date"
        className="h-8 w-[160px]"
        value={c.value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (c.op === "is")
    return (
      <SimpleSelect
        value={String(c.value)}
        onChange={(v) => onChange(v === "true")}
        options={[
          { value: "true", label: "Sim" },
          { value: "false", label: "Não" },
        ]}
      />
    );
  return (
    <Input
      className="h-8 w-[200px]"
      value={String(c.value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Texto"
    />
  );
}

function SimpleSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
