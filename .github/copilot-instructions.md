# Copilot Instructions

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript strict
- Tailwind CSS 4
- next-intl (`en`/`sv`)
- Framer Motion
- Vitest
- Cloudflare Workers

## Commands

- `npm run check` - all checks (`type-check`, `format:check`,
  `spell:check`, `lint`, `lint:md`, `test`)
- `npm run test` - run tests
- `npm run dev` - start dev server

## General Rules

- After changes, update relevant `docs/*.md` when behavior or workflows change.
- If you change visible UI elements, labels, roles, or layout surfaces, also update the Developer Mode developer help in `docs/developer-mode-overlay.md`, the related `data-developer-mode-*` markers or scanner heuristics, and the relevant tests.
- Developer Mode is a desktop-only developer tool. Its overlay, chips, badge, and toast do **not** need to follow WCAG touch-target sizes, mobile responsiveness, or accessibility guidelines. Keep chips compact so they don't obscure the underlying UI.

## Database Schema Changes

When making any changes to the database schema (`drizzle/schema.ts`) or migration files:

1. **Support versioning** — Any new table or column that is linked to a requirement must also be represented in the `requirement_versions` table (and related version tables). Extend the schema with the necessary columns and relations so that every requirement-linked property is captured in the version snapshot.
2. **Localized taxonomy columns** — Taxonomy/lookup tables (e.g. categories, types, scenarios) must have separate English and Swedish columns for every user-facing text field, using the naming convention `{name}_en` and `{name}_sv` (e.g. `name_en`, `name_sv`, `description_en`, `description_sv`). The UI selects the correct column based on the active locale.
3. **Update seed data** — Ensure `drizzle/seed.ts` includes appropriate test data for any new or modified tables and columns. Every table in the schema must have representative seed rows.
4. **Use `UPDATE, DELETE, INSERT OR IGNORE`** — Seed statements must be idempotent so they can be re-run safely.
5. **Run `npm run db:setup`** — After schema and seed changes, verify the full migrate + seed flow works from a clean state.
6. **Use `ALTER TABLE` in migrations** — Cloudflare D1 does not reliably honor `PRAGMA foreign_keys=OFF` across statements, so the DROP-and-recreate pattern for renaming/adding columns will fail with foreign-key constraint errors. Always use `ALTER TABLE … RENAME COLUMN` and `ALTER TABLE … ADD COLUMN` instead.
7. **Prefer lookup tables over repeated text** — Do not store the same text value (e.g. status name, category label) inline across many rows. Instead, create a lookup/reference table with an integer primary key and reference it via a foreign key. This reduces database size and improves index performance, since integer keys are smaller and faster to compare than duplicated text strings.
8. **Update schema documentation** — After any change to the database schema, migrations, or seed data, update `docs/database-schema.md` to reflect the new or modified tables, columns, relationships, and seed values. The documentation must stay in sync with the actual schema at all times.
9. **Database naming standard** — All schema identifiers must be US English, lowercase ASCII `snake_case`. Tables: plural nouns. Columns: singular, no abbreviations; booleans prefixed `is_`/`has_`/`can_`. PK: always `id`. FK: `<referenced_table_singular>_id`. Timestamps: `created_at`/`updated_at`/`deleted_at`. Constraint names: `pk_<table>`, `fk_<table>_<col>`, `uq_<table>_<col>`, `idx_<table>_<col>`, `chk_<table>_<col>`. Data values may contain Swedish characters (UTF-8). See `docs/database-schema.md` § Database Naming Standard for the full specification.
10. **Explicitly name all indexes and constraints** — Never rely on Drizzle's auto-generated names (e.g. `.unique()`). Always use `uniqueIndex('uq_<table>_<col>')` or `index('idx_<table>_<col>')` in the table's third argument so that every index follows the naming standard and is visible in the schema definition.
11. **US English in taxonomy data** — English text values in taxonomy/lookup tables (e.g. `name_en`, `description_en`) must use US English spelling (e.g. `behavior` not `behaviour`, `analyzability` not `analysability`). <!-- cSpell:ignore analysability -->
12. **Update lifecycle-dates documentation** — When changing lifecycle date columns (e.g. `created_at`, `updated_at`, `published_at`, `archived_at`, `deleted_at`), status fields, or status seed values, update `docs/version-lifecycle-dates.md` to reflect the new behavior. The documentation must accurately describe which actions set or clear each date, how status transitions affect timestamps, and when new versions are or are not created.
13. **`edited_at` invariant** — `edited_at` is set **only** when user-initiated content fields change (e.g. description, acceptance criteria, category). It must **never** be updated on status transitions (`transitionStatus`, `archiveRequirement`) or when system-controlled date fields (`published_at`, `archived_at`) change. Status transitions are in-place `UPDATE` operations on the existing version row — they must not create new version rows.

## UI Dialogs

<!-- markdownlint-disable MD013 -->

- Never use native `confirm()`, `alert()`, or `window.confirm()`. Use `useConfirmModal()` from `components/ConfirmModal`.
- `confirm(options)` returns `Promise<boolean>`. Options: `message` (required), `title?`, `confirmText?`, `cancelText?`, `showCancel?` (default `true`), `variant?` (`'default'` | `'danger'`), `icon?` (`'info'` | `'warning'` | `'caution'` | `LucideIcon`), `anchorEl?` (`HTMLElement`).
- Destructive actions (delete, archive) must use `variant: 'danger'` and `icon: 'caution'`.
- Alert-style dialogs (no cancel) use `showCancel: false`.
- Pass `anchorEl` for popover positioning near the trigger button. For arrow-wrapper onClick: `onClick={(e) => handler(id, e.currentTarget as HTMLElement)}`. For direct-ref onClick: add `e?: React.MouseEvent<HTMLButtonElement>` to handler, capture `e?.currentTarget` before any `await`.
- `ConfirmModalProvider` is already mounted in `app/[locale]/layout.tsx`.

<!-- markdownlint-enable MD013 -->
