---
applyTo: "lib/typeorm/entities/**/*.ts"
---

# TypeORM EntitySchema Authoring

Hand-authored migrations under `typeorm/migrations/` are the DDL source of truth. Entities and migrations must agree; `tests/unit/entities-metadata.test.ts` enforces drift.

See `.github/instructions/database-schema.instructions.md` for naming, versioning, and migration rules.

## File Layout

- One file per table: `<table-singular>.ts` (e.g. `owner.ts` for `owners`).
- Each file exports an interface `<Name>Entity` and a `const <name>Entity = new EntitySchema<<Name>Entity>({...})`.
- Register every entity in `index.ts` by adding it to `sqlServerEntities` and re-exporting both the type and the const.

## EntitySchema Shape

- Use `new EntitySchema<...>({...})`. Do not use decorator classes (`@Entity`, `@Column`).
- Set `name:` to PascalCase singular logical name; `tableName:` to the exact plural `snake_case` table name.

```ts
export const exampleEntity = new EntitySchema<ExampleEntity>({
  name: 'Example',
  tableName: 'examples',
  columns: {
    id: { name: 'id', primary: true, type: 'int', generated: 'increment' },
    someField: { name: 'some_field', type: 'nvarchar', length: 255 },
    isActive: { name: 'is_active', type: 'bit', default: () => '1' },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  uniques: [{ name: 'uq_examples_some_field', columns: ['someField'] }],
  indices: [{ name: 'idx_examples_is_active', columns: ['isActive'] }],
  relations: {
    owner: {
      type: 'many-to-one',
      target: 'Owner',
      joinColumn: {
        name: 'owner_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'fk_examples_owner_id',
      },
      onDelete: 'RESTRICT',
      nullable: false,
    },
  },
})
```

## Column Rules

- Always set `name:`, even when it equals the property name.
- Always set `type:` to a SQL Server type string (`nvarchar`, `datetime2`, `bit`, `int`, `bigint`, `decimal`, `text`). Do not rely on TS-type inference.
- For `nvarchar`, set `length` to match the migration (or `'MAX'`).
- For nullable columns, set `nullable: true`.
- For booleans, use `type: 'bit'`. The DAL/value-mapper layer converts `0`/`1` to JS `boolean`.

## Relation Rules

- Express every foreign key as a `relations:` entry. Do not also add the raw `*_id` column to `columns:` — the relation owns the column.
- `joinColumn.name` must be the exact `snake_case` FK column name.
- `joinColumn.foreignKeyConstraintName` must equal the migration's `CONSTRAINT fk_<table>_<col>` name.
- Always set `onDelete:` explicitly (`RESTRICT`, `CASCADE`, `SET NULL`, or `NO ACTION`).

## Unique And Index Rules

- Always set `name:` on every entry in `uniques` and `indices`. Auto-generated names are rejected by the metadata test.
- Multi-column constraints list properties in the same order as the migration's `CREATE INDEX` / `ADD CONSTRAINT` statement.

## Localized Columns

- Map `name_en` + `name_sv`, `description_en` + `description_sv`, etc. as separate properties (`nameEn`, `nameSv`, ...). Do not collapse into a single object.

## Registration Checklist

1. Create `lib/typeorm/entities/<name>.ts` per the rules above.
2. Add it to `sqlServerEntities` in `index.ts` and re-export the type + const.
3. Run `npm run check` — `tests/unit/entities-metadata.test.ts` verifies naming + that the table appears in the migration SQL.
4. If you also changed the schema, update the migration in `typeorm/migrations/`, `typeorm/seed.mjs`, `docs/database-schema.md`, and the architecture diagram in `docs/arkitekturbeskrivning-kravhantering.md`.
