---
applyTo: "{drizzle/schema.ts,drizzle/seed.ts,drizzle/migrations/*.sql,drizzle/migrations/meta/*.json,docs/database-schema.md}"
---

# Database Schema Changes

## Standard

- Follow `docs/database-schema.md` for every schema change.
- Use `id` as the only primary key unless the table is a documented join-table exception.
- Use `<name>_<locale>` for localized columns such as `name_sv`, `description_en`, `singular_sv`.
- Prefix boolean columns with `is_`, `has_`, or `can_`.
- Keep natural keys such as `key` and `column_id` as non-primary columns with unique indexes.

## Retired Columns

- If a column is no longer used and cannot be removed safely, rename it to
  `unused_1`, `unused_2`, etc.
- Apply this when the column must remain for compatibility/history or when
  schema or migration constraints prevent safe removal.
- Number `unused_n` per table. Use the lowest available positive integer in
  that table.
- Use `ALTER TABLE ... RENAME COLUMN ... TO unused_n` for the rename.
- Clear existing data from the renamed column in the same migration. Prefer
  `NULL`; if the column cannot be `NULL`, use a neutral empty value with no
  business meaning.
- Keep `drizzle/schema.ts` in sync with a neutral field name such as
  `unused1`.
- Remove retired-column wiring from DAL, services, UI, tests, and docs. Do
  not keep product semantics attached to an `unused_n` column.

## Sync

- Update `drizzle/schema.ts`, migrations, `drizzle/seed.ts`, affected DAL/tests, and `docs/database-schema.md` in the same change.
- If a deviation is required, add it to `Accepted Exceptions` in `docs/database-schema.md` in the same change.
