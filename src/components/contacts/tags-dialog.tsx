import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_TAG_COLOR, TAG_COLORS, useTags } from "@/hooks/use-catalog";
import { logActivity } from "@/lib/audit";
import { friendlyDbError } from "@/lib/contacts";

export function TagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const tags = useTags();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_TAG_COLOR);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("tags")
      .insert({ name: name.trim(), color })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "Já existe uma tag com esse nome." : friendlyDbError(error),
      );
      return;
    }
    await logActivity("tag.create", { name: name.trim() }, "tag", data.id);
    setName("");
    refresh();
  }

  async function rename(id: string, value: string) {
    const v = value.trim();
    if (!v) return;
    const { error } = await supabase.from("tags").update({ name: v }).eq("id", id);
    if (error) {
      toast.error(
        error.code === "23505" ? "Já existe uma tag com esse nome." : friendlyDbError(error),
      );
      return;
    }
    refresh();
  }

  async function recolor(id: string, c: string) {
    await supabase.from("tags").update({ color: c }).eq("id", id);
    refresh();
  }

  async function remove(id: string, tagName: string) {
    if (!confirm(`Excluir a tag "${tagName}"? Ela será removida de todos os contatos.`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) {
      toast.error(friendlyDbError(error));
      return;
    }
    await logActivity("tag.delete", { name: tagName }, "tag", id);
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>Etiquetas para organizar e segmentar contatos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova tag, ex.: Cliente VIP"
          />
          <ColorPicker value={color} onChange={setColor} />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar
          </Button>
        </form>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {(tags.data ?? []).length === 0 && (
            <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma tag ainda.</li>
          )}
          {(tags.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-2 p-2">
              <ColorPicker
                value={t.color ?? DEFAULT_TAG_COLOR}
                onChange={(c) => recolor(t.id, c)}
              />
              <Input
                defaultValue={t.name}
                className="h-8"
                onBlur={(e) => e.target.value !== t.name && rename(t.id, e.target.value)}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Excluir ${t.name}`}
                onClick={() => remove(t.id, t.name)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const next = () =>
    onChange(TAG_COLORS[(TAG_COLORS.indexOf(value) + 1) % TAG_COLORS.length] ?? DEFAULT_TAG_COLOR);
  return (
    <button
      type="button"
      onClick={next}
      title="Trocar cor"
      aria-label="Trocar cor"
      className="h-8 w-8 shrink-0 rounded-md border"
      style={{ backgroundColor: value }}
    />
  );
}
