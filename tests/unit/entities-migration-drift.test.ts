import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sqlServerEntities } from '@/lib/typeorm/entities'

/**
 * Offline drift guard between TypeORM `EntitySchema` definitions and the
 * hand-authored initial migration. For every registered entity this test
 * asserts that:
 *
 *  1. Every entity `columns[*].name` exists in the migration's
 *     `CREATE TABLE [<table>] ( ... )` block.
 *  2. Every entity unique/index `name` appears in the migration source.
 *  3. Every relation `joinColumn.foreignKeyConstraintName` appears in the
 *     migration source.
 *  4. Every relation join column `name` exists in the migration's column
 *     list for the owning table.
 *
 * This catches renamed columns, missing constraints, and entity-level FKs
 * that do not match what the database actually ships, without needing a
 * live SQL Server connection.
 */

const MIGRATION_PATH = join(
  process.cwd(),
  'typeorm',
  'migrations',
  '0001_initial_sqlserver.mjs',
)

const migrationSource = readFileSync(MIGRATION_PATH, 'utf8')

interface EntityOptionsLike {
  columns?: Record<string, { name?: string }>
  indices?: Array<{ name?: string }>
  name: string
  relations?: Record<
    string,
    {
      joinColumn?:
        | { name?: string; foreignKeyConstraintName?: string }
        | Array<{ name?: string; foreignKeyConstraintName?: string }>
    }
  >
  tableName?: string
  uniques?: Array<{ name?: string }>
}

function getOptions(entity: unknown): EntityOptionsLike {
  return (entity as { options: EntityOptionsLike }).options
}

function extractTableColumns(table: string): Set<string> {
  // Match `CREATE TABLE [<table>] ( ... );` capturing the body.
  const pattern = new RegExp(
    `CREATE TABLE \\[${table}\\] \\(([\\s\\S]*?)\\);`,
    'm',
  )
  const match = migrationSource.match(pattern)
  if (!match) return new Set()
  const body = match[1]
  const columns = new Set<string>()
  // Each column line looks like:  [column_name] <type> ...
  for (const colMatch of body.matchAll(/\[([a-z_][a-z0-9_]*)\]/g)) {
    columns.add(colMatch[1])
  }
  return columns
}

describe('sqlServerEntities migration drift', () => {
  for (const entity of sqlServerEntities) {
    const options = getOptions(entity)
    const tableName = options.tableName ?? options.name

    describe(`entity ${options.name} (${tableName})`, () => {
      const migrationColumns = extractTableColumns(tableName)

      it('has a CREATE TABLE block in the migration', () => {
        expect(
          migrationColumns.size,
          `migration must declare CREATE TABLE [${tableName}]`,
        ).toBeGreaterThan(0)
      })

      it('every entity column exists in the migration table', () => {
        for (const [key, column] of Object.entries(options.columns ?? {})) {
          const colName = column.name
          expect(
            colName,
            `entity ${options.name}.${key} must declare column.name`,
          ).toBeTypeOf('string')
          expect(
            migrationColumns.has(colName as string),
            `column [${colName}] declared on entity ${options.name} (${key}) is missing from migration table [${tableName}]. Migration columns: ${[...migrationColumns].sort().join(', ')}`,
          ).toBe(true)
        }
      })

      it('every relation join column exists in the migration table', () => {
        for (const [name, relation] of Object.entries(
          options.relations ?? {},
        )) {
          const joinColumns = Array.isArray(relation.joinColumn)
            ? relation.joinColumn
            : relation.joinColumn
              ? [relation.joinColumn]
              : []
          for (const jc of joinColumns) {
            expect(
              jc.name,
              `relation ${tableName}.${name} must declare joinColumn.name`,
            ).toBeTypeOf('string')
            expect(
              migrationColumns.has(jc.name as string),
              `relation ${tableName}.${name} joinColumn [${jc.name}] is missing from migration table [${tableName}]`,
            ).toBe(true)
          }
        }
      })

      it('every unique constraint name appears in the migration', () => {
        for (const unique of options.uniques ?? []) {
          expect(
            unique.name,
            `unique constraint on ${tableName} must have an explicit name`,
          ).toBeTypeOf('string')
          expect(
            migrationSource.includes(`[${unique.name}]`),
            `unique constraint [${unique.name}] from entity ${options.name} is missing from migration source`,
          ).toBe(true)
        }
      })

      it('every index name appears in the migration', () => {
        for (const index of options.indices ?? []) {
          expect(
            index.name,
            `index on ${tableName} must have an explicit name`,
          ).toBeTypeOf('string')
          expect(
            migrationSource.includes(`[${index.name}]`),
            `index [${index.name}] from entity ${options.name} is missing from migration source`,
          ).toBe(true)
        }
      })

      it('every relation foreign key constraint name appears in the migration', () => {
        for (const [name, relation] of Object.entries(
          options.relations ?? {},
        )) {
          const joinColumns = Array.isArray(relation.joinColumn)
            ? relation.joinColumn
            : relation.joinColumn
              ? [relation.joinColumn]
              : []
          const fkNames = joinColumns
            .map(c => c.foreignKeyConstraintName)
            .filter((n): n is string => typeof n === 'string')
          for (const fkName of fkNames) {
            expect(
              migrationSource.includes(`[${fkName}]`),
              `foreign key [${fkName}] from entity ${options.name}.${name} is missing from migration source`,
            ).toBe(true)
          }
        }
      })
    })
  }
})
