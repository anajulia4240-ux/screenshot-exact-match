import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "destructive";
}

const TONES: Record<NonNullable<KpiProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  "chart-2": "bg-chart-2/15 text-chart-2",
  "chart-3": "bg-chart-3/15 text-chart-3",
  "chart-4": "bg-chart-4/15 text-chart-4",
  "chart-5": "bg-chart-5/15 text-chart-5",
  destructive: "bg-destructive/10 text-destructive",
};

export function Kpi({ icon: Icon, label, value, hint, tone = "primary" }: KpiProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", TONES[tone])}><Icon className="h-4 w-4" /></span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
      <Inbox className="mb-2 h-6 w-6" />
      <p className="max-w-sm">{text}</p>
      {children}
    </div>
  );
}

export function ErrorState({ text = "Não foi possível carregar os dados." }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4" /> {text}
    </div>
  );
}

export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Flag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" | "danger" | "ok" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    warn: "bg-chart-4/15 text-chart-4",
    danger: "bg-destructive/10 text-destructive",
    ok: "bg-chart-2/15 text-chart-2",
  }[tone];
  return <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}
