---
applyTo: "{lib/typeorm/**/*.ts,typeorm/migrations/**/*.mjs,typeorm/seed*.mjs,docs/reference/database-schema.md}"
---

# Database Schema Changes

## Stack

- The sole database stack is SQL Server + TypeORM.
- Schema is defined by TypeORM entities under `lib/typeorm/entities/`.
- Migrations live in `typeorm/migrations/` (one `.mjs` file per migration).
- Seed data lives in `typeorm/seed.mjs` and is applied by the explicit
  `npm run db:seed:required` and `npm run db:seed:demo` profiles.
- Preserve current seed-data meaning and identifiers wherever possible. Document unavoidable drift explicitly.

## Standard

- Follow `docs/reference/database-schema.md` for every schema change.
- All identifiers are US English, lowercase ASCII `snake_case`. Tables: plural nouns. Columns: singular, no abbreviations.
- PK: always `id` unless the table is a documented join-table exception. FK: `<referenced_table_singular>_id`.
- Timestamps: `created_at`, `updated_at`, `deleted_at`, `published_at`, `archived_at`, `edited_at`.
- Constraint names: `pk_<table>`, `fk_<table>_<col>`, `uq_<table>_<col>`, `idx_<table>_<col>`, `chk_<table>_<col>`.
- Always pass an explicit `name` to TypeORM `@Index`/`@Unique` and to migration `CREATE INDEX` / `ALTER TABLE … ADD CONSTRAINT`. Never rely on auto-generated names.
- Prefix boolean columns with `is_`, `has_`, or `can_`.
- Use `<field>_en` / `<field>_sv` paired columns for every user-facing text field in taxonomy/lookup tables (`name_en`, `name_sv`, `description_en`, `description_sv`). UI selects by active locale.
- `*_en` values use US English spelling (`behavior`, not `behaviour`; `analyzability`, not `analysability`).
- Keep natural keys such as `key` and `column_id` as non-primary columns with unique indexes.
- Data values may contain Swedish characters (UTF-8).
- See `docs/reference/database-schema.md` § Database Naming Standard for the full specification.

## Versioning

- Any table or column linked to a requirement must also appear in `requirement_versions` and related version tables so every requirement-linked property is captured in the version snapshot.

## Removed Columns

- Drop unused columns with `ALTER TABLE [<table>] DROP COLUMN [<column>]` in a
  new migration.
- Do not edit already released migrations. Historical migrations may contain
  the old column before a later removal migration drops it.
- Drop dependent default constraints, indexes, check constraints, and foreign
  keys before dropping a column.
- Remove dropped columns from TypeORM entities, seeds, DAL, services, UI,
  tests, and docs in the same change.
- Do not keep unused columns under neutral placeholder names.
- Use `down` to recreate only the schema shape when dropped data cannot be
  restored. Use a clear `THROW` when rollback would be misleading or unsafe.

## Foreign Keys

- Define foreign keys via TypeORM `EntitySchema` `relations:` entries with
  `joinColumn.name` and `joinColumn.foreignKeyConstraintName`.
- Do not add raw `*_id` relation columns to `columns:` unless the scalar ID is
  part of the entity primary key, unique key, or documented lookup contract.
- Name FK constraints `fk_<table>_<col>` where `<table>` is the declaring table
  and `<col>` is the full referencing column name, for example
  `fk_orders_user_id` on `[user_id]`.
- Specify referential actions with explicit `onDelete`. Add `onUpdate` only
  when the relation or migration uses it.
- In raw migration SQL use this shape:

```sql
ALTER TABLE [<table>]
  ADD CONSTRAINT [fk_<table>_<col>]
  FOREIGN KEY ([<col>])
  REFERENCES [<other>] ([id])
  ON DELETE <action>
```

## Sync

- Update the affected TypeORM entity, the new migration in
  `typeorm/migrations/`, `typeorm/seed.mjs`, the affected DAL/tests, and
  `docs/reference/database-schema.md` in the same change.
- If a deviation is required, add it to `Accepted Exceptions` in
  `docs/reference/database-schema.md` in the same change.

## Operator Upgrade Notes

- When a migration or required seed change requires operator action before
  upgrade, update `docs/operations/operator-upgrade-notes.md` under `## Unreleased` with
  a 1-3 sentence note.
- Complete the PR's Operator Upgrade Impact section.

## Personal Data / Privacy

- Treat columns that store or derive living-person identity as personal data.
  This includes `name`, `display_name`, `first_name`, `last_name`, `email`,
  `hsa_id`, `*_by`, `*_by_hsa_id`, `*_display_name`, actor snapshots,
  assignees, owners, responsible users, co-authors, and decision/resolution
  identities.
- When a schema change adds, renames, removes, or changes semantics for such a
  field, update the Admin Center Privacy / Dataskydd erasure workflow in the
  same change.
- Add or update the relevant `GROUP_POLICIES` entry in
  `lib/privacy/erasure.ts` so preview and execution handle the field by HSA-id.
- Use HSA-id as the durable identity key. Names, email addresses, and display
  names are snapshots or contact details, never matching keys for erasure.
- Add or update seeded privacy scenarios in `typeorm/seed.mjs`, including
  representative HSA-id values and duplicate-name coverage when ambiguity is
  possible.
- Add or update tests for preview, execution, exact HSA-id matching, duplicate
  name safety, no-replacement anonymization, and UI/i18n copy when the field is
  visible in Admin Privacy.
- Update `docs/governance/admin-center.md`, `docs/reference/database-schema.md`, and relevant auth
  or API security docs so the privacy surface and limitations remain explicit.
- Do not add database-backed privacy audit logs unless explicitly requested.
  The current privacy audit events are platform security-log events and are not
  part of the Admin Privacy preview matrix.

## Documentation Checklist

When any database schema, migration, or seed change is made, review and
update **every** applicable section of `docs/reference/database-schema.md`:

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
     named `fk_*` constraints.
5. **Index Relationship Diagram** — add/remove nodes and edges in the
   Mermaid `graph LR` diagram.
6. **Status Workflow** — update the seed-transitions table and workflow
   prose when status or transition rows change.
7. **Database Naming Standard** — update rules or accepted exceptions
   when a new naming pattern is introduced.

## Canonical Data Model

`docs/reference/database-schema.md` is the sole canonical schema and ER diagram
documentation. Do not maintain a second architecture ER diagram.

## Removal Cleanup

When a table, column, index, or constraint is removed from the schema,
remove **all** references to it from `docs/reference/database-schema.md`:

- The entity and its columns in the Mermaid `erDiagram`.
- Relationship lines that reference the removed entity.
- The table documentation section (column table, seed values, notes).
- Rows in the Accepted Exceptions table that only apply to the removed
  object.
- Rows in the Unique Indexes, Non-Unique Indexes, and Named Foreign Key
  Constraints tables.
- Nodes and edges in the Index Relationship Diagram.
- Any prose references in the Status Workflow or other narrative sections.

## Migration Workflow

1. Update or add the relevant TypeORM entity under `lib/typeorm/entities/`.
2. Add a new migration file under `typeorm/migrations/` named
   `NNNN_<name>.mjs`. Migrations are hand-authored; embed the `up` and
   `down` SQL statements as string arrays and execute them with
   `queryRunner.query(...)`. The file is auto-discovered by
   `lib/typeorm/sqlserver-config.ts` and `scripts/db-sqlserver-admin.mjs`
   (sorted by filename) — do not maintain a manual import list.
3. Prefer SQL Server `ALTER TABLE … ADD`, `ALTER COLUMN`, and `sp_rename`
   over drop-and-recreate for renames and additions, to keep FK safety.
4. Update `typeorm/seed.mjs` so every table in the schema has
   representative, idempotent seed rows. Wrap identity tables in
   `SET IDENTITY_INSERT [table] ON/OFF` and guard inserts with
   `IF NOT EXISTS`.
5. Run `npm run db:setup` to verify the full clean migrate + seed flow
   against a local SQL Server.

## Lifecycle Dates

- When changing lifecycle date columns, status fields, or status seed values, update `docs/reference/version-lifecycle-dates.md`.
- `edited_at` is set only when user-initiated content fields change (e.g. description, acceptance criteria, category).
- `edited_at` must not change on status transitions (`transitionStatus`, `initiateArchiving`, `approveArchiving`, `cancelArchiving`) or on system-controlled date changes (`published_at`, `archived_at`, `archive_initiated_at`).
- Status transitions are in-place `UPDATE` operations on the existing version row — they must not create new version rows.

### Prohibited

- Never use `synchronize: true` in production runtime configuration.
- Never edit a migration that has already been released; add a new one.
- Never store the same text value (e.g. status name, category label)
  inline across many rows — use a lookup table with an integer primary key.
