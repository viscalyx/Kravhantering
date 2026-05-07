---
applyTo: "{lib/typeorm/**/*.ts,typeorm/migrations/**/*.mjs,typeorm/seed.mjs,docs/database-schema.md,docs/arkitekturbeskrivning-kravhantering.md}"
---

# Database Schema Changes

## Stack

- The sole database stack is SQL Server + TypeORM.
- Schema is defined by TypeORM entities under `lib/typeorm/entities/`.
- Migrations live in `typeorm/migrations/` (one `.mjs` file per migration).
- Seed data lives in `typeorm/seed.mjs` and is applied by `npm run db:seed`.
- Preserve current seed-data meaning and identifiers wherever possible. Document unavoidable drift explicitly.

## Standard

- Follow `docs/database-schema.md` for every schema change.
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
- See `docs/database-schema.md` § Database Naming Standard for the full specification.

## Versioning

- Any table or column linked to a requirement must also appear in `requirement_versions` and related version tables so every requirement-linked property is captured in the version snapshot.

## Retired Columns

- If a column is no longer used and cannot be removed safely, rename it to
  `unused_1`, `unused_2`, etc.
- Apply this when the column must remain for compatibility/history or when
  schema or migration constraints prevent safe removal.
- Number `unused_n` per table. Use the lowest available positive integer in
  that table.
- Use `sp_rename '<table>.<old>', '<new>', 'COLUMN'` (or
  `EXEC sp_rename`) for the rename inside the migration.
- Clear existing data from the renamed column in the same migration. Prefer
  `NULL`; if the column cannot be `NULL`, use a neutral empty value with no
  business meaning.
- Keep the corresponding TypeORM entity in sync with a neutral field name
  such as `unused1`.
- Remove retired-column wiring from DAL, services, UI, tests, and docs. Do
  not keep product semantics attached to an `unused_n` column.

## Foreign Keys

- Define foreign keys via TypeORM `@ManyToOne` / `@JoinColumn({ name: '<col>_id', foreignKeyConstraintName: 'fk_<table>_<col>' })`.
- Name FK constraints `fk_<table>_<col>` where `<table>` is the declaring table and `<col>` is the referencing column name.
- Specify referential actions (`onDelete`, `onUpdate`) on the relation decorator.
- In raw migration SQL use `ALTER TABLE [<table>] ADD CONSTRAINT [fk_<table>_<col>] FOREIGN KEY ([<col>_id]) REFERENCES [<other>] ([id]) ON DELETE <action>`.

## Sync

- Update the affected TypeORM entity, the new migration in
  `typeorm/migrations/`, `typeorm/seed.mjs`, the affected DAL/tests, and
  `docs/database-schema.md` in the same change.
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
     named `fk_*` constraints.
5. **Index Relationship Diagram** — add/remove nodes and edges in the
   Mermaid `graph LR` diagram.
6. **Status Workflow** — update the seed-transitions table and workflow
   prose when status or transition rows change.
7. **Database Naming Standard** — update rules or accepted exceptions
   when a new naming pattern is introduced.

## Architecture Data Model

When tables or relationships are added, removed, or renamed, update the
Mermaid `erDiagram` in the "Datamodell — kärnrelationer" section of
`docs/arkitekturbeskrivning-kravhantering.md`. The ER diagram there must
reflect the same entities and relationships as the schema.

## Removal Cleanup

When a table, column, index, or constraint is removed from the schema,
remove **all** references to it from `docs/database-schema.md`:

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

- When changing lifecycle date columns, status fields, or status seed values, update `docs/version-lifecycle-dates.md`.
- `edited_at` is set only when user-initiated content fields change (e.g. description, acceptance criteria, category).
- `edited_at` must not change on status transitions (`transitionStatus`, `initiateArchiving`, `approveArchiving`, `cancelArchiving`) or on system-controlled date changes (`published_at`, `archived_at`, `archive_initiated_at`).
- Status transitions are in-place `UPDATE` operations on the existing version row — they must not create new version rows.

### Prohibited

- Never use `synchronize: true` in production runtime configuration.
- Never edit a migration that has already been released; add a new one.
- Never store the same text value (e.g. status name, category label)
  inline across many rows — use a lookup table with an integer primary key.
