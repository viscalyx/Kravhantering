---
applyTo: "{app/api/**/*.ts,package.json}"
---

# Next.js Runtime

## API Routes

- Do not add `export const runtime = 'edge'` to `app/api/**/route.ts`.
- When a route handler needs database access, use
  `await getRequestSqlServerDataSource()` from `@/lib/db` (returns a
  `SqlServerDatabase` wrapper that exposes `query`, `transaction`, and
  `getRepository`).
- Do not couple route handlers to platform-specific runtime bindings.

### Turbopack routing conflict — never nest API routes under `[locale]`

- Do not place API routes at paths that can be matched by `app/[locale]/...`. Turbopack's `[locale]` dynamic segment captures every path segment including `api`, returning a 404 HTML page instead of the route handler.
- Safety check: the second segment of an API route must not match any page under `app/[locale]/`.
- Safe patterns:
  - `app/api/requirement-transitions/[id]/route.ts`
  - `app/api/requirement-suggestions/[id]/route.ts`
  - `app/api/specification-item-deviations/[itemId]/route.ts`
- Unsafe patterns:
  - `app/api/requirements/[id]/transition/route.ts`
  - `app/api/requirements/[id]/improvement-suggestions/route.ts`
  - `app/api/specifications/[id]/items/[itemId]/deviations/route.ts`
- When moving or creating a route, verify its URL cannot be matched by any `app/[locale]/**` page. Use a conflict-free top-level noun if there is overlap.

## Local And Prod-Like Scripts

- Keep `DATABASE_URL` (and optionally `DATABASE_READONLY_URL`) as the runtime contract in scripts and route-related setup. The application connects to Microsoft SQL Server via TypeORM.
- `SQLSERVER_DATABASE_URL` / `SQLSERVER_DATABASE_READONLY_URL` are accepted aliases used by the admin scripts; routes only read `DATABASE_URL`.
- Prod-like validation uses `npm run build` and `npm run start:prodlike`.
