import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sqlServerEntities } from '@/lib/typeorm/entities'

/**
 * Offline drift guard between TypeORM `EntitySchema` definitions and the
 * hand-authored migration chain. For every registered entity this test
 * asserts that:
 *
 *  1. Every entity `columns[*].name` exists in the migration's table
 *     definition, including tables later established through `sp_rename`.
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

const MIGRATIONS_DIR = join(process.cwd(), 'typeorm', 'migrations')

const migrationSource = readdirSync(MIGRATIONS_DIR)
  .filter(file => file.endsWith('.mjs'))
  .sort()
  .map(file => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  .join('\n')

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

function extractTableRenameSources(table: string): string[] {
  const sources: string[] = []
  const tableRenamePattern =
    /EXEC sp_rename N'([a-z_][a-z0-9_]*)', N'([a-z_][a-z0-9_]*)'/g
  for (const match of migrationSource.matchAll(tableRenamePattern)) {
    if (match[2] === table) {
      sources.push(match[1])
    }
  }
  return sources
}

function extractTableColumns(table: string): Set<string> {
  const columns = new Set<string>()
  const sourceTables = [table, ...extractTableRenameSources(table)]

  // Match `CREATE TABLE [<table>] ( ... );` capturing the body. If the final
  // table name is introduced through `sp_rename`, read the source table too.
  for (const sourceTable of sourceTables) {
    const createPattern = new RegExp(
      `CREATE TABLE \\[${sourceTable}\\] \\(([\\s\\S]*?)\\);`,
      'gm',
    )
    for (const match of migrationSource.matchAll(createPattern)) {
      for (const colMatch of match[1].matchAll(/\[([a-z_][a-z0-9_]*)\]/g)) {
        columns.add(colMatch[1])
      }
    }
  }

  // Later migrations may extend a table with `ALTER TABLE ... ADD ...`.
  const alterAddPattern = new RegExp(
    `ALTER TABLE \\[${table}\\]\\s+ADD\\s+([\\s\\S]*?);`,
    'gm',
  )
  for (const match of migrationSource.matchAll(alterAddPattern)) {
    for (const colMatch of match[1].matchAll(/\[([a-z_][a-z0-9_]*)\]/g)) {
      columns.add(colMatch[1])
    }
  }

  // Later migrations may rename columns with SQL Server `sp_rename`.
  // Include both directions so this offline parser can still verify current
  // entity columns without trying to simulate the full migration state machine.
  const columnRenamePattern = new RegExp(
    `EXEC\\s+sp_rename\\s+N'${table}\\.([a-z_][a-z0-9_]*)',\\s*N'([a-z_][a-z0-9_]*)',\\s*N'COLUMN'`,
    'g',
  )
  for (const match of migrationSource.matchAll(columnRenamePattern)) {
    columns.add(match[2])
  }

  return columns
}

describe('sqlServerEntities migration drift', () => {
  for (const entity of sqlServerEntities) {
    const options = getOptions(entity)
    const tableName = options.tableName ?? options.name

    describe(`entity ${options.name} (${tableName})`, () => {
      const migrationColumns = extractTableColumns(tableName)

      it('has table columns established in the migration', () => {
        expect(
          migrationColumns.size,
          `migration must declare or rename table [${tableName}]`,
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
