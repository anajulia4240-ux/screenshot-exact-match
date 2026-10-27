import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  BarChart3, Cable, LayoutDashboard, ListFilter, LogOut, Mail, Menu, MessageCircle, Megaphone, Settings, Users, Workflow, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { logActivity } from "@/lib/audit";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contatos", icon: Users },
  { to: "/lists", label: "Listas e segmentos", icon: ListFilter },
  { to: "/campaigns", label: "Campanhas", icon: Megaphone },
  { to: "/email", label: "E-mail marketing", icon: Mail },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/automations", label: "Automações", icon: Workflow },
  { to: "/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/integrations", label: "Integrações", icon: Cable },
  { to: "/settings", label: "Configurações", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 px-4 text-sidebar-accent-foreground">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Zap className="h-4 w-4" />
      </div>
      <span className="font-semibold">Pulsar</span>
    </div>
  );
}

export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await logActivity("auth.logout");
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const footer = (
    <div className="mt-auto border-t border-sidebar-border p-2">
      <button
        onClick={signOut}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="h-4 w-4" /> Sair
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-sidebar lg:flex">
        <Brand />
        <NavList />
        {footer}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
              <Brand />
              <NavList onNavigate={() => setOpen(false)} />
              {footer}
            </SheetContent>
          </Sheet>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PhasePending({ phase, items }: { phase: number; items: string[] }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-8">
      <span className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">Fase {phase}</span>
      <h2 className="mt-3 text-lg font-semibold">Módulo ainda não implementado</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A estrutura de dados já está pronta. Este módulo será liberado na fase {phase} e incluirá:
      </p>
      <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
        {items.map((i) => (
          <li key={i} className="flex gap-2"><span className="text-primary">•</span>{i}</li>
        ))}
      </ul>
    </div>
  );
}
