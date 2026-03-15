import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createStatus,
  createTransition,
  deleteStatus,
  deleteTransition,
  getStatusById,
  getTransitionsFrom,
  listStatuses,
  listTransitions,
  updateStatus,
} from '@/lib/dal/requirement-statuses'
import type { Database as AppDatabase } from '@/lib/db'

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  const migrationsDir = join(process.cwd(), 'drizzle/migrations')
  const sqlFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
  for (const file of sqlFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const s = statement.trim()
      if (s) sqlite.exec(s)
    }
  }
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

type TestDb = ReturnType<typeof createTestDb>['db']

describe('requirement-statuses DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  it('listStatuses returns empty when no statuses', async () => {
    const result = await listStatuses(db as unknown as AppDatabase)
    expect(result).toEqual([])
  })

  it('createStatus and getStatusById', async () => {
    const created = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })
    expect(created).toMatchObject({ nameEn: 'Draft', nameSv: 'Utkast' })

    const found = await getStatusById(db as unknown as AppDatabase, created.id)
    expect(found).toMatchObject({ nameEn: 'Draft' })
  })

  it('updateStatus changes fields', async () => {
    const created = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })

    const updated = await updateStatus(
      db as unknown as AppDatabase,
      created.id,
      { nameEn: 'Review', color: 'yellow' },
    )
    expect(updated).toMatchObject({ nameEn: 'Review', color: 'yellow' })
  })

  it('deleteStatus removes status', async () => {
    const created = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 10,
      color: 'red',
    })

    await deleteStatus(db as unknown as AppDatabase, created.id)
    const result = await listStatuses(db as unknown as AppDatabase)
    expect(result).toEqual([])
  })

  it('deleteStatus prevents deletion of system statuses', async () => {
    const created = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'System',
      nameSv: 'System',
      sortOrder: 1,
      color: 'gray',
      isSystem: true,
    })

    await expect(
      deleteStatus(db as unknown as AppDatabase, created.id),
    ).rejects.toThrow()
  })

  it('createTransition and listTransitions', async () => {
    const s1 = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })
    const s2 = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: 'yellow',
    })

    await createTransition(db as unknown as AppDatabase, s1.id, s2.id)

    const transitions = await listTransitions(db as unknown as AppDatabase)
    expect(transitions.length).toBe(1)
    expect(transitions[0]).toMatchObject({
      fromStatusId: s1.id,
      toStatusId: s2.id,
    })
  })

  it('getTransitionsFrom returns valid targets', async () => {
    const s1 = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })
    const s2 = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: 'yellow',
    })

    await createTransition(db as unknown as AppDatabase, s1.id, s2.id)

    const targets = await getTransitionsFrom(
      db as unknown as AppDatabase,
      s1.id,
    )
    expect(targets.length).toBe(1)
  })

  it('deleteTransition removes transition', async () => {
    const s1 = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })
    const s2 = await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
      color: 'yellow',
    })

    const transition = await createTransition(
      db as unknown as AppDatabase,
      s1.id,
      s2.id,
    )

    await deleteTransition(db as unknown as AppDatabase, transition.id)
    const transitions = await listTransitions(db as unknown as AppDatabase)
    expect(transitions).toEqual([])
  })

  it('listStatuses respects sortOrder', async () => {
    await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Published',
      nameSv: 'Publicerad',
      sortOrder: 3,
      color: 'green',
    })
    await createStatus(db as unknown as AppDatabase, {
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })

    const result = await listStatuses(db as unknown as AppDatabase)
    expect(result[0].nameEn).toBe('Draft')
    expect(result[1].nameEn).toBe('Published')
  })
})
