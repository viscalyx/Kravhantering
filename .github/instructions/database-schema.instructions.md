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

## Foreign Keys

- Use table-level `foreignKey({ name: 'fk_<table>_<col>', columns: [...], foreignColumns: [...] })` for all FK constraints that need explicit names.
- Do not rely on `.references()` for named constraints — `ReferenceConfig.actions` has no `constraintName` option (drizzle-orm ≥ 0.45).
- Name FK constraints `fk_<table>_<col>` where `<table>` is the declaring table and `<col>` is the referencing column name.
- Chain `.onDelete(action)` / `.onUpdate(action)` on the `foreignKey()` builder for referential actions.

## Sync

- Update `drizzle/schema.ts`, migrations, `drizzle/seed.ts`, affected
  DAL/tests, and `docs/database-schema.md` in the same change.
- If a deviation is required, add it to `Accepted Exceptions` in
  `docs/database-schema.md` in the same change.

## Documentation Checklist

When any database schema, migration, or seed change is made, review and
update **every** applicable section of `docs/database-schema.md`:

1. **Entity-Relationship Diagram** — add/remove/rename entities, columns,
   and relationship lines in the Mermaid `erDiagram`.
2. **Table documentation section** — add or update the column table, seed
   values, and per-table index/constraint notes for every affected table.
   Place new tables in the correct category: Lookup / Taxonomy, UI Settings,
   Core Domain, or Join / Bridge.
3. **Accepted Exceptions** — add a row when a new table deviates from the
   naming standard (e.g. composite PK instead of `id`).
4. **Indexes & Constraints Reference** — update all three sub-tables:
   - *Unique Indexes* — add/remove rows for `uq_*` indexes.
   - *Non-Unique Indexes* — add/remove rows for `idx_*` indexes.
   - *Named Foreign Key Constraints* — add/remove rows for explicitly
     named `fk_*` constraints (those using `foreignKey({ name })`).
5. **Index Relationship Diagram** — add/remove nodes and edges in the
   Mermaid `graph LR` diagram.
6. **Status Workflow** — update the seed-transitions table and workflow
   prose when status or transition rows change.
7. **Database Naming Standard** — update rules or accepted exceptions
   when a new naming pattern is introduced.
