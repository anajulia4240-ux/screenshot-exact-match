import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { META_PIXEL_ID, captureTestEventCode, fbqTrack } from "@/lib/fbq";
import { applyPriceOverrides, type PriceMap } from "@/lib/catalog";
import { getPublicPrices } from "@/lib/prices.functions";

const UTMIFY_PIXEL_ID = "6ae9f434e4625a333942a594";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ocorreu um erro. Tente novamente.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a href="/" className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "byhappy | Kits Happy Hair com Brindes e Frete Grátis" },
      { name: "description", content: "Kits Happy Hair originais com brindes grátis, frete grátis e pagamento via PIX. Revendedora autorizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [
      {
        // Pixel da Meta + Utmify: só nas páginas da loja (nunca no painel/login).
        // window.__byLoad também é chamado ao navegar do painel para a loja sem recarregar.
        children: `window.__byStore=function(p){return p==='/'||p.indexOf('/checkout')===0||p.indexOf('/rastreio')===0};window.__byLoad=function(){if(window.fbq)return false;!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq.disablePushState=true;var _am={};try{var _r=localStorage.getItem('byhappy_fb_am');if(_r){var _p=JSON.parse(_r);if(_p&&typeof _p==='object')_am=_p;}}catch(e){}if(!_am.country)_am.country='br';fbq('init','${META_PIXEL_ID}',_am,{agent:'lovable'});fbq('track','PageView');try{window.pixelId="${UTMIFY_PIXEL_ID}";var a=document.createElement("script");a.setAttribute("async","");a.setAttribute("defer","");a.setAttribute("src","https://cdn.utmify.com.br/scripts/pixel/pixel.js");document.head.appendChild(a);}catch(e){}return true};if(window.__byStore(location.pathname))window.__byLoad();`,
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap",
      },
    ],
  }),
  // Preços definidos na aba Preços do painel (cache de 1 min).
  loader: async (): Promise<PriceMap> => getPublicPrices().catch(() => ({})),
  staleTime: 60_000,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Aplica os preços do painel antes de renderizar a loja (SSR e navegação).
  applyPriceOverrides(Route.useLoaderData() ?? {});
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // Script de UTMs da Utmify (só após hidratação) + PageView nas trocas de rota (SPA).
  useEffect(() => {
    const w = window as unknown as { __byStore?: (p: string) => boolean; __byLoad?: () => boolean };
    const isStore = (p: string) => w.__byStore?.(p) ?? false;
    const loadUtms = () => {
      if (document.getElementById("utmify-utms")) return;
        const sc = document.createElement("script");
        sc.id = "utmify-utms";
        sc.src = "https://cdn.utmify.com.br/scripts/utms/latest.js";
        sc.async = true;
        sc.defer = true;
        sc.setAttribute("data-utmify-prevent-xcod-sck", "");
        sc.setAttribute("data-utmify-prevent-subids", "");
        document.head.appendChild(sc);
    };
    const enterStore = () => {
      try {
        captureTestEventCode();
        loadUtms();
        // true = Pixel acabou de carregar e já enviou o PageView desta página.
        return w.__byLoad?.() ?? false;
      } catch {
        return false; /* nunca quebra a página */
      }
    };
    if (isStore(window.location.pathname)) enterStore();
    let last = window.location.pathname;
    return router.subscribe("onResolved", ({ toLocation }) => {
      if (toLocation.pathname === last) return;
      last = toLocation.pathname;
      if (!isStore(toLocation.pathname)) return; // painel/login: nenhum evento
      if (!enterStore()) fbqTrack("PageView");
    });
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
