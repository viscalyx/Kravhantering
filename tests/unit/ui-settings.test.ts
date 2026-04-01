import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  getRequirementListColumnDefaults,
  getUiTerminology,
  updateRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import type { Database as AppDatabase } from '@/lib/db'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  getRequirementColumnOrder,
  normalizeRequirementListColumnDefaults,
} from '@/lib/requirements/list-view'

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  const journal = JSON.parse(
    readFileSync(
      join(process.cwd(), 'drizzle/migrations/meta/_journal.json'),
      'utf8',
    ),
  ) as {
    entries: Array<{ tag: string }>
  }
  const migrationFiles = journal.entries.map(
    entry => `drizzle/migrations/${entry.tag}.sql`,
  )

  for (const migrationFile of migrationFiles) {
    const migrationSql = readFileSync(
      join(process.cwd(), migrationFile),
      'utf8',
    )

    for (const statement of migrationSql.split('--> statement-breakpoint')) {
      const sql = statement.trim()
      if (sql) {
        sqlite.exec(sql)
      }
    }
  }

  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

describe('ui settings DAL', () => {
  it('persists reordered requirement column defaults without violating the unique sort order index', async () => {
    const { db, sqlite } = createTestDb()

    try {
      const appDb = db as unknown as AppDatabase
      await updateRequirementListColumnDefaults(
        appDb,
        DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      )

      const reorderedDefaults = normalizeRequirementListColumnDefaults([
        { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
        { columnId: 'description', defaultVisible: true, sortOrder: 1 },
        { columnId: 'category', defaultVisible: true, sortOrder: 2 },
        { columnId: 'area', defaultVisible: true, sortOrder: 3 },
        { columnId: 'type', defaultVisible: true, sortOrder: 4 },
        {
          columnId: 'qualityCharacteristic',
          defaultVisible: false,
          sortOrder: 5,
        },
        { columnId: 'status', defaultVisible: true, sortOrder: 6 },
        { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
        { columnId: 'version', defaultVisible: false, sortOrder: 8 },
      ])

      const savedColumns = await updateRequirementListColumnDefaults(
        appDb,
        reorderedDefaults,
      )
      const loadedColumns = await getRequirementListColumnDefaults(appDb)
      const persistedRows = await db
        .select()
        .from(schema.requirementListColumnDefaults)
        .orderBy(asc(schema.requirementListColumnDefaults.sortOrder))

      expect(getRequirementColumnOrder(savedColumns)).toEqual([
        'uniqueId',
        'description',
        'category',
        'area',
        'type',
        'qualityCharacteristic',
        'status',
        'requiresTesting',
        'version',
        'needsReference',
      ])
      expect(getRequirementColumnOrder(loadedColumns)).toEqual([
        'uniqueId',
        'description',
        'category',
        'area',
        'type',
        'qualityCharacteristic',
        'status',
        'requiresTesting',
        'version',
        'needsReference',
      ])
      expect(
        persistedRows.map(row => ({
          columnId: row.columnId,
          isDefaultVisible: row.isDefaultVisible,
          sortOrder: row.sortOrder,
        })),
      ).toEqual([
        { columnId: 'uniqueId', isDefaultVisible: true, sortOrder: 0 },
        { columnId: 'description', isDefaultVisible: true, sortOrder: 1 },
        { columnId: 'category', isDefaultVisible: true, sortOrder: 2 },
        { columnId: 'area', isDefaultVisible: true, sortOrder: 3 },
        { columnId: 'type', isDefaultVisible: true, sortOrder: 4 },
        {
          columnId: 'qualityCharacteristic',
          isDefaultVisible: false,
          sortOrder: 5,
        },
        { columnId: 'status', isDefaultVisible: true, sortOrder: 6 },
        { columnId: 'requiresTesting', isDefaultVisible: false, sortOrder: 7 },
        { columnId: 'version', isDefaultVisible: false, sortOrder: 8 },
        { columnId: 'needsReference', isDefaultVisible: false, sortOrder: 9 },
      ])
    } finally {
      sqlite.close()
    }
  })

  it('rethrows terminology storage failures instead of silently substituting defaults', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingDb = {
      select: () => ({
        from: () => {
          throw new Error('terminology unavailable')
        },
      }),
    } as unknown as AppDatabase

    try {
      await expect(getUiTerminology(failingDb)).rejects.toThrow(
        'terminology unavailable',
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('rethrows column-default storage failures instead of silently substituting defaults', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failingDb = {
      select: () => ({
        from: () => ({
          orderBy: () => {
            throw new Error('column defaults unavailable')
          },
        }),
      }),
    } as unknown as AppDatabase

    try {
      await expect(getRequirementListColumnDefaults(failingDb)).rejects.toThrow(
        'column defaults unavailable',
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
