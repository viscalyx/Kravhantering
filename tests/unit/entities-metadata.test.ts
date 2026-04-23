import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sqlServerEntities } from '@/lib/typeorm/entities'

/**
 * Source-of-truth bridge: every entity registered in `sqlServerEntities`
 * must (1) follow our naming/typing conventions and (2) refer to a table
 * that exists in the hand-authored migration. This guards against drift
 * between the EntitySchema definitions and the SQL DDL we actually ship.
 */

const MIGRATION_PATH = join(
  process.cwd(),
  'typeorm',
  'migrations',
  '0001_initial_sqlserver.mjs',
)

const migrationSource = readFileSync(MIGRATION_PATH, 'utf8')

const NAMING_PATTERNS = {
  table: /^[a-z][a-z0-9_]*$/,
  column: /^[a-z][a-z0-9_]*$/,
  unique: /^uq_[a-z0-9_]+$/,
  index: /^idx_[a-z0-9_]+$/,
  foreignKey: /^fk_[a-z0-9_]+$/,
}

interface EntityOptionsLike {
  columns?: Record<string, unknown>
  indices?: Array<{ name?: string; columns?: Array<string | (() => unknown)> }>
  name: string
  relations?: Record<
    string,
    {
      type?: string
      joinColumn?:
        | { name?: string; foreignKeyConstraintName?: string }
        | Array<{ name?: string; foreignKeyConstraintName?: string }>
    }
  >
  tableName?: string
  uniques?: Array<{ name?: string; columns: Array<string | (() => unknown)> }>
}

function getOptions(entity: unknown): EntityOptionsLike {
  return (entity as { options: EntityOptionsLike }).options
}

describe('sqlServerEntities metadata conventions', () => {
  it('has at least one entity registered', () => {
    expect(sqlServerEntities.length).toBeGreaterThan(0)
  })

  for (const entity of sqlServerEntities) {
    const options = getOptions(entity)
    const tableName = options.tableName ?? options.name

    describe(`entity ${options.name} (${tableName})`, () => {
      it('uses a snake_case plural-or-singular table name', () => {
        expect(tableName).toMatch(NAMING_PATTERNS.table)
      })

      it('declares an explicit snake_case `name` and a SQL Server `type` for every column', () => {
        const columns = options.columns ?? {}
        for (const [propertyName, raw] of Object.entries(columns)) {
          const column = raw as {
            name?: string
            type?: unknown
            primary?: boolean
          }
          expect(
            column.name,
            `column ${tableName}.${propertyName} must declare an explicit name`,
          ).toBeTypeOf('string')
          expect(
            column.name as string,
            `column ${tableName}.${propertyName} name must be snake_case`,
          ).toMatch(NAMING_PATTERNS.column)
          expect(
            column.type,
            `column ${tableName}.${propertyName} must declare an explicit type`,
          ).toBeDefined()
        }
      })

      it('uses standard-conformant names for every unique constraint', () => {
        for (const unique of options.uniques ?? []) {
          expect(
            unique.name,
            `unique on ${tableName} columns=${JSON.stringify(
              unique.columns,
            )} must declare an explicit name`,
          ).toBeTypeOf('string')
          expect(unique.name as string).toMatch(NAMING_PATTERNS.unique)
        }
      })

      it('uses standard-conformant names for every index', () => {
        for (const index of options.indices ?? []) {
          expect(
            index.name,
            `index on ${tableName} columns=${JSON.stringify(
              index.columns,
            )} must declare an explicit name`,
          ).toBeTypeOf('string')
          expect(index.name as string).toMatch(NAMING_PATTERNS.index)
        }
      })

      it('declares snake_case FK column names and `fk_*` constraint names for every relation', () => {
        for (const [relationName, relation] of Object.entries(
          options.relations ?? {},
        )) {
          const joinColumns = Array.isArray(relation.joinColumn)
            ? relation.joinColumn
            : relation.joinColumn
              ? [relation.joinColumn]
              : []
          for (const joinColumn of joinColumns) {
            expect(
              joinColumn.name,
              `relation ${tableName}.${relationName} must declare joinColumn.name`,
            ).toBeTypeOf('string')
            expect(joinColumn.name as string).toMatch(NAMING_PATTERNS.column)
          }
          // For composite FKs TypeORM applies a single foreignKeyConstraintName
          // to the whole composite, so it only needs to appear on one column.
          // FK constraint names are optional (some self-references intentionally
          // omit the database-level FK), but when declared they must match the
          // `fk_*` naming standard.
          const constraintNames = joinColumns
            .map(c => c.foreignKeyConstraintName)
            .filter((n): n is string => typeof n === 'string')
          for (const name of constraintNames) {
            expect(name).toMatch(NAMING_PATTERNS.foreignKey)
          }
        }
      })

      it('has its table created in the initial migration', () => {
        expect(
          migrationSource.includes(`CREATE TABLE [${tableName}]`),
          `migration must contain CREATE TABLE [${tableName}]`,
        ).toBe(true)
      })
    })
  }
})
