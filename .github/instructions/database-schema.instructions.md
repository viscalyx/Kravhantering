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

## Sync

- Update `drizzle/schema.ts`, migrations, `drizzle/seed.ts`, affected DAL/tests, and `docs/database-schema.md` in the same change.
- If a deviation is required, add it to `Accepted Exceptions` in `docs/database-schema.md` in the same change.
