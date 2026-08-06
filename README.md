# Sipario Reel

Short-video streaming app built with TanStack Start (React 19), Vite 7, Tailwind CSS v4
and shadcn/ui. Mobile-first responsive UI with a custom glass video player
(gesture seek, hold-to-2x, fullscreen with orientation lock) and ad slots.

## Quick start

```bash
npm install
npm run dev        # http://localhost:8080
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (`.output/`) |
| `npm run build:dev` | Development-mode build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Deployment

Cloudflare Workers deployment — build, deploy, version deploy, gradual rollout,
secrets, logs and CI: see [DEPLOYMENT.md](./DEPLOYMENT.md).
