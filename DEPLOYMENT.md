# Deployment Guide — Cloudflare Workers

This app is a TanStack Start (React 19 + Vite 7) application. The production build
targets the Cloudflare Workers runtime, so it deploys as a single Worker that serves
both the SSR HTML and the static client assets.

---

## 1. Prerequisites

- Node.js 20+ (or Bun 1.1+)
- A Cloudflare account
- `wrangler` CLI (used via `npx`, no global install needed)

```bash
npm install            # or: bun install
npx wrangler --version
npx wrangler login     # opens a browser to authorise your account
```

---

## 2. Local development

```bash
npm run dev            # http://localhost:8080
```

---

## 3. Build

```bash
npm run build          # production build
npm run build:dev      # development-mode build (source maps, no minify)
```

The build output is written to `.output/` (Worker entry + static assets),
generated from `src/server.ts` via the Nitro Cloudflare preset.

Verify the build locally against the Workers runtime before deploying:

```bash
npx wrangler dev .output/server/index.mjs --assets .output/public --local
```

---

## 4. Wrangler configuration

Create `wrangler.toml` in the repository root (only needed once):

```toml
name = "video-app"
main = ".output/server/index.mjs"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".output/public"
binding = "ASSETS"

[observability]
enabled = true
```

Notes:
- `nodejs_compat` is required — server code uses Node built-ins (`crypto`, `stream`, `buffer`).
- Change `name` to your desired Worker name; it becomes
  `https://<name>.<your-subdomain>.workers.dev`.

---

## 5. Deploy

Full deploy (build then upload):

```bash
npm run build
npx wrangler deploy
```

One-liner:

```bash
npm run build && npx wrangler deploy
```

Deploy to a named environment (e.g. staging):

```bash
npx wrangler deploy --env staging
```

---

## 6. Version deploys (gradual / preview releases)

Cloudflare "Versions & Deployments" lets you upload a version without sending
production traffic to it, then promote or split traffic.

```bash
# 1. Build
npm run build

# 2. Upload a new version WITHOUT serving it (returns a preview URL + version ID)
npx wrangler versions upload

# 3. List versions
npx wrangler versions list

# 4. View a specific version
npx wrangler versions view <VERSION_ID>

# 5. Promote a version to 100% production traffic
npx wrangler versions deploy <VERSION_ID>@100%

# 6. Gradual rollout: 10% new / 90% current
npx wrangler versions deploy <NEW_VERSION_ID>@10% <CURRENT_VERSION_ID>@90%

# 7. Inspect / roll back
npx wrangler deployments list
npx wrangler rollback --message "Reverting regression"
```

---

## 7. Environment variables and secrets

Public, build-time values must be prefixed `VITE_` and live in `.env`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Server-only secrets are stored in Cloudflare, never in the repo:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret list
npx wrangler secret delete SOME_KEY
```

Read them inside a server function handler with `process.env['NAME']` (never at module scope).

---

## 8. Custom domain

```bash
npx wrangler deploy --routes "example.com/*"
```

Or add the domain in the Cloudflare dashboard:
**Workers & Pages → your Worker → Settings → Domains & Routes → Add custom domain**.

---

## 9. Logs and troubleshooting

```bash
npx wrangler tail                 # live production logs
npx wrangler tail --format pretty
```

Common issues:

| Symptom | Cause / fix |
| --- | --- |
| `__dirname is not defined` | A Node-only dependency; replace with a Workers-compatible package. |
| `[unenv] X is not implemented yet!` | Stubbed Node API (`child_process`, `os.cpus`) — not available on Workers. |
| Works in dev, fails in prod | Test with `wrangler dev .output/server/index.mjs` before deploying. |
| Blank page / hydration error | Stale build — delete `.output/` and `node_modules/.vite`, rebuild. |
| Assets 404 | `[assets].directory` must point at `.output/public`. |

---

## 10. CI example (GitHub Actions)

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

Create the API token in Cloudflare with the **Edit Cloudflare Workers** template.

---

## Command cheat sheet

| Purpose | Command |
| --- | --- |
| Install | `npm install` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Dev-mode build | `npm run build:dev` |
| Local Workers test | `npx wrangler dev .output/server/index.mjs --assets .output/public --local` |
| Deploy | `npm run build && npx wrangler deploy` |
| Upload version only | `npx wrangler versions upload` |
| Promote version | `npx wrangler versions deploy <ID>@100%` |
| Gradual rollout | `npx wrangler versions deploy <NEW>@10% <OLD>@90%` |
| Rollback | `npx wrangler rollback` |
| Live logs | `npx wrangler tail` |
