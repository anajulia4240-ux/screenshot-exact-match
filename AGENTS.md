<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Private single-tenant app: public signup is disabled; login is username + password, mapped to synthetic email `<username>@pulsar.local` (no real email, so no password-reset email). First created auth user becomes admin via `handle_new_user` trigger. Why: owner wants username-only login.
- Data access gated by `public.is_member(auth.uid())` (any row in user_roles); suppressions delete and settings writes require admin. Why: shared workspace, least privilege for destructive actions.
- Provider secrets (email/WhatsApp) live only in server secrets and are used from `createServerFn`/`/api/public/*` routes, never in tables or the browser. Why: spec forbids exposing tokens.
- Delivery states are distinct (`accepted` vs `delivered`); never mark delivered without a provider webhook. Why: reports must not show fake results.
- App pages use `AppShell` from `src/components/app-shell.tsx` under `src/routes/_authenticated/`; the project is a store admin panel (one route per tab).
- Ad-origin labels always come from `extractAdsInfo` in `src/lib/store.ts`. Why: every tab must show the same campaign/adset/ad for a customer.
- Store tracking tables are member-only; the storefront must write through `/api/public/*` server routes, never with anon table access. Why: anon write policies let anyone forge or unlock sessions.
- The storefront lives at `/` and `/checkout` (painel at `/auth` → `/dashboard`); order totals are always recomputed server-side from `src/lib/catalog.ts`. Why: the browser must never set prices.
