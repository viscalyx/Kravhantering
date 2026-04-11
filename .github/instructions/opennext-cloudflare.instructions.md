---
applyTo: "{app/api/**/*.ts,package.json}"
---

# OpenNext Cloudflare

## API Routes

- Do not add `export const runtime = 'edge'` to `app/api/**/route.ts`.
- When a route handler needs Cloudflare bindings, use
  `await getCloudflareContext({ async: true })`.

### Turbopack routing conflict — never nest API routes under `[locale]`

In development (Turbopack), the `app/[locale]` dynamic segment captures **every**
path segment, including `api`. A request to `/api/requirements/123/transition`
is matched as `[locale]=api`, causing Next.js to render the nearest page instead
of the API route handler — resulting in a 404 HTML response.

**Rule:** API routes must **never** be placed at a path that can be matched by
`app/[locale]/...`. In practice this means the **second** path segment of an API
route must not match any page path under `app/[locale]/`.

Safe pattern — use a distinct, flat noun as the second segment:

```
app/api/requirement-transitions/[id]/route.ts     ✓
app/api/requirement-suggestions/[id]/route.ts     ✓
app/api/package-item-deviations/[itemId]/route.ts ✓
```

Unsafe pattern — mirrors a page path under `[locale]`:

```
app/api/requirements/[id]/transition/route.ts                        ✗
app/api/requirements/[id]/improvement-suggestions/route.ts           ✗
app/api/requirement-packages/[id]/items/[itemId]/deviations/route.ts ✗
```

When moving or creating a route handler, verify that its full URL cannot be
matched by any `app/[locale]/**` page. If there is any overlap, use a
conflict-free top-level noun (e.g. `package-item-deviations` instead of
`requirement-packages/[id]/items/[itemId]/deviations`).

## Preview Scripts

- Preserve `.wrangler` in preview startup scripts.
- Local D1 preview state lives under `.wrangler/state/v3/d1`.
- `prepreview` may remove `.open-next`; do not remove `.wrangler`.
