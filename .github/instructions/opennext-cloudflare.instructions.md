---
applyTo: "{app/api/**/*.ts,package.json}"
---

# OpenNext Cloudflare

## API Routes

- Do not add `export const runtime = 'edge'` to `app/api/**/route.ts`.
- When a route handler needs Cloudflare bindings, use
  `await getCloudflareContext({ async: true })`.

## Preview Scripts

- Preserve `.wrangler` in preview startup scripts.
- Local D1 preview state lives under `.wrangler/state/v3/d1`.
- `prepreview` may remove `.open-next`; do not remove `.wrangler`.
