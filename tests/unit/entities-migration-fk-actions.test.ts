import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sqlServerEntities } from '@/lib/typeorm/entities'

/**
 * Symmetric drift guard between TypeORM relation `onDelete` / `onUpdate`
 * declarations and the SQL emitted by the migration files.
 *
 * For every relation that declares a `foreignKeyConstraintName` this test
 * locates the *last* `ALTER TABLE ... ADD CONSTRAINT [<fk>] FOREIGN KEY ...`
 * statement across the concatenated migration sources (later migrations
 * override earlier definitions of the same constraint) and asserts:
 *
 *  1. The migration emits an explicit `ON DELETE <action>` clause.
 *  2. The migration emits an explicit `ON UPDATE <action>` clause.
 *  3. Both actions equal the entity declaration.
 *
 * The 0001 baseline left ON UPDATE implicit on every FK and ON DELETE
 * implicit on most. Migration 0003 makes both explicit on every FK.
 */

const migrationsRoot = join(process.cwd(), 'typeorm', 'migrations')

/**
 * Discover migration files dynamically so the FK drift guard always validates
 * the on-disk migration history. Filenames must match `NNNN_*.mjs` and are
 * sorted lexicographically to preserve chronological order.
 */
const MIGRATION_FILES = readdirSync(migrationsRoot)
  .filter(file => /^\d{4}_.*\.mjs$/.test(file))
  .sort()

/**
 * Extracts only the `UP_STATEMENTS` array body from a migration file. The
 * companion `DOWN_STATEMENTS` block intentionally rolls FKs back to their
 * pre-this-migration shape (often without explicit clauses), so feeding it
 * to the FK-action regex would mask drift in UP.
 */
function readUpStatements(file: string): string {
  const source = readFileSync(join(migrationsRoot, file), 'utf8')
  const start = source.indexOf('const UP_STATEMENTS')
  if (start === -1) {
    throw new Error(
      `Migration ${file} is missing the 'const UP_STATEMENTS' marker; the FK drift guard cannot read its UP block.`,
    )
  }
  const open = source.indexOf('[', start)
  if (open === -1) {
    throw new Error(
      `Migration ${file} declares 'const UP_STATEMENTS' but no opening '[' was found; the FK drift guard cannot read its UP block.`,
    )
  }
  let depth = 0
  // Bracket-depth scan assumes SQL Server delimited identifiers ([name]) are
  // always balanced. It counts every '[' and ']' in the source — including any
  // inside SQL string literals — so an embedded literal ']' would prematurely
  // terminate the scan and truncate UP_STATEMENTS. None of the current
  // migrations contain such a literal; keep this in mind before adding one.
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(
    `Migration ${file} has an unterminated '[' starting at index ${open}; the FK drift guard cannot read its UP block.`,
  )
}

const migrationSource = MIGRATION_FILES.map(readUpStatements).join('\n')

type ReferentialAction = 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT'

interface FkDeclaration {
  entityName: string
  fkName: string
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
  relationName: string
}

interface RelationLike {
  joinColumn?:
    | { foreignKeyConstraintName?: string }
    | Array<{ foreignKeyConstraintName?: string }>
  onDelete?: string
  onUpdate?: string
}

interface EntityOptionsLike {
  name: string
  relations?: Record<string, RelationLike>
}

function getOptions(entity: unknown): EntityOptionsLike {
  return (entity as { options: EntityOptionsLike }).options
}

function normalizeAction(value: unknown): ReferentialAction {
  if (typeof value !== 'string') return 'NO ACTION'
  const upper = value.toUpperCase()
  if (
    upper === 'CASCADE' ||
    upper === 'SET NULL' ||
    upper === 'SET DEFAULT' ||
    upper === 'NO ACTION'
  ) {
    return upper
  }
  if (upper === 'RESTRICT') return 'NO ACTION'
  return 'NO ACTION'
}

function collectEntityFks(): FkDeclaration[] {
  const out: FkDeclaration[] = []
  for (const entity of sqlServerEntities) {
    const options = getOptions(entity)
    for (const [relationName, relation] of Object.entries(
      options.relations ?? {},
    )) {
      const joinColumns = Array.isArray(relation.joinColumn)
        ? relation.joinColumn
        : relation.joinColumn
          ? [relation.joinColumn]
          : []
      for (const jc of joinColumns) {
        const fkName = jc.foreignKeyConstraintName
        if (typeof fkName !== 'string') continue
        out.push({
          entityName: options.name,
          relationName,
          fkName,
          onDelete: normalizeAction(relation.onDelete),
          onUpdate: normalizeAction(relation.onUpdate),
        })
      }
    }
  }
  return out
}

interface MigrationFkClause {
  onDelete: ReferentialAction | null
  onUpdate: ReferentialAction | null
}

const ADD_CONSTRAINT_RE =
  /ALTER TABLE \[[a-z_][a-z0-9_]*\] ADD CONSTRAINT \[([a-z_][a-z0-9_]*)\] FOREIGN KEY \([^)]*\) REFERENCES \[[a-z_][a-z0-9_]*\] \([^)]*\)([^;]*);/gi

function parseMigrationFks(): Map<string, MigrationFkClause> {
  const result = new Map<string, MigrationFkClause>()
  for (const match of migrationSource.matchAll(ADD_CONSTRAINT_RE)) {
    const fkName = match[1]
    const tail = match[2] ?? ''
    const onDeleteMatch = tail.match(
      /ON\s+DELETE\s+(NO\s+ACTION|CASCADE|SET\s+NULL|SET\s+DEFAULT)/i,
    )
    const onUpdateMatch = tail.match(
      /ON\s+UPDATE\s+(NO\s+ACTION|CASCADE|SET\s+NULL|SET\s+DEFAULT)/i,
    )
    // Last occurrence wins: later ADD CONSTRAINT statements override earlier
    // ones (which were dropped by the same migration before being re-added).
    result.set(fkName, {
      onDelete: onDeleteMatch
        ? (onDeleteMatch[1]
            .toUpperCase()
            .replace(/\s+/g, ' ') as ReferentialAction)
        : null,
      onUpdate: onUpdateMatch
        ? (onUpdateMatch[1]
            .toUpperCase()
            .replace(/\s+/g, ' ') as ReferentialAction)
        : null,
    })
  }
  return result
}

const entityFks = collectEntityFks()
const migrationFks = parseMigrationFks()

describe('sqlServerEntities FK referential-action drift', () => {
  it('every entity FK is present in the migration source', () => {
    const missing = entityFks
      .filter(fk => !migrationFks.has(fk.fkName))
      .map(fk => `${fk.entityName}.${fk.relationName} -> [${fk.fkName}]`)
    expect(
      missing,
      `entity FKs missing from migrations: ${missing.join(', ')}`,
    ).toEqual([])
  })

  for (const fk of entityFks) {
    describe(`[${fk.fkName}] (${fk.entityName}.${fk.relationName})`, () => {
      const migration = migrationFks.get(fk.fkName)

      it('emits an explicit ON DELETE clause', () => {
        expect(
          migration?.onDelete,
          `migration must include ON DELETE clause for [${fk.fkName}]`,
        ).not.toBeNull()
      })

      it('emits an explicit ON UPDATE clause', () => {
        expect(
          migration?.onUpdate,
          `migration must include ON UPDATE clause for [${fk.fkName}]`,
        ).not.toBeNull()
      })

      it('ON DELETE matches entity declaration', () => {
        expect(
          migration?.onDelete,
          `entity ${fk.entityName}.${fk.relationName} declares onDelete='${fk.onDelete}', but migration emits onDelete='${migration?.onDelete}' for [${fk.fkName}]`,
        ).toBe(fk.onDelete)
      })

      it('ON UPDATE matches entity declaration', () => {
        expect(
          migration?.onUpdate,
          `entity ${fk.entityName}.${fk.relationName} declares onUpdate='${fk.onUpdate}', but migration emits onUpdate='${migration?.onUpdate}' for [${fk.fkName}]`,
        ).toBe(fk.onUpdate)
      })
    })
  }
})
