# Deploy Vaani-AI frontend to Vercel

The frontend is a Vite + React SPA. The backend (Supabase edge functions + DB)
is already live in Mumbai — Vercel only serves the frontend, which talks to
Supabase over HTTPS. No localhost, real HTTPS, no cert warnings, mic works.

## What's already wired for you
- `vercel.json` — SPA rewrites (so `/cockpit`, `/asha`, `/auth` don't 404 on
  refresh), Vite framework preset, `npm install --legacy-peer-deps`.
- `.npmrc` — `legacy-peer-deps=true` so Vercel's install succeeds.
- Production build is green (`npm run build` → `dist/`).

## One-time setup (Vercel dashboard, ~5 min)

1. Go to https://vercel.com/new
2. **Import** the GitHub repo `mannpandya1702/Vaani-AI`
3. Vercel auto-detects **Vite**. Leave build settings as-is (vercel.json drives them).
4. Set **Environment Variables** (Production scope) — see the list below.
   ⚠️ ONLY the `VITE_`-prefixed vars. NEVER add `SUPABASE_SERVICE_ROLE_KEY`,
   `VAPI_API_KEY`, `ANTHROPIC_API_KEY`, or any non-`VITE_` secret — those are
   server-only and would be exposed in the browser bundle.
5. **Deploy.** You'll get a URL like `https://vaani-ai.vercel.app`.

## Environment variables (Production)

All of these are client-side / public-safe (they ship in the JS bundle):

| Variable | Source |
|---|---|
| `VITE_SUPABASE_URL` | `https://kjhpmoqybqnjpqfqitqr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | from `.env.local` (anon key — public) |
| `VITE_VAPI_PUBLIC_KEY` | from `.env.local` (VAPI **public** key) |
| `VITE_VAPI_ASSISTANT_ID_HI` | `466283fd-a6ed-4652-a960-e486009a85a8` |
| `VITE_VAPI_ASSISTANT_ID_TA` | `70d9fe0c-24c8-4597-ab7c-7254e77671be` |
| `VITE_AGENT_PHONE_DISPLAY` | `+1 513-822-7440` |
| `VITE_RMP_NAME` | (optional) the RMP's display name |
| `VITE_RMP_MCI_REG` | (optional) the RMP's reg number |
| `VITE_SENTRY_DSN` | (optional) Sentry project DSN |

## CRITICAL post-deploy step — wire the Vercel URL into Supabase Auth

Once you have the Vercel URL (e.g. `https://vaani-ai.vercel.app`), the magic-link
login will NOT work until that URL is added to Supabase Auth's allow-list +
Site URL. Otherwise the login email's link bounces.

Tell Claude the URL and it'll wire it in 30 seconds, or do it manually:
- Supabase Dashboard → Authentication → URL Configuration
  - **Site URL**: `https://<your-vercel-url>`
  - **Redirect URLs**: add `https://<your-vercel-url>/**`

## Auto-deploy

After the first import, Vercel auto-deploys every push to `main`. Feature
branches get preview URLs automatically. No manual redeploys needed.

## Why no localhost HTTPS pain anymore
- Vercel serves real HTTPS → `getUserMedia` (mic) works with no cert warning.
- The `@vitejs/plugin-basic-ssl` self-signed cert was only for local `vite dev`;
  it's a no-op in the production build, so it doesn't affect Vercel at all.
