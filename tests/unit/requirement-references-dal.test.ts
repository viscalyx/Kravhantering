import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createReference,
  deleteReference,
  listReferencesForVersion,
  replaceReferencesForVersion,
  updateReference,
} from '@/lib/dal/requirement-references'
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

async function setupReqWithVersion(db: TestDb) {
  // Create area for FK
  const [area] = await db
    .insert(schema.requirementAreas)
    .values({ prefix: 'TST', name: 'Test Area' })
    .returning()
  // Create status for FK
  const [status] = await db
    .insert(schema.requirementStatuses)
    .values({
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
      color: 'blue',
    })
    .returning()
  // Create requirement
  const [req] = await db
    .insert(schema.requirements)
    .values({
      uniqueId: 'TST-001',
      requirementAreaId: area.id,
      sequenceNumber: 1,
    })
    .returning()
  // Create version
  const [version] = await db
    .insert(schema.requirementVersions)
    .values({
      requirementId: req.id,
      versionNumber: 1,
      statusId: status.id,
      description: 'Test',
    })
    .returning()
  return { area, status, req, version }
}

describe('requirement-references DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  it('listReferencesForVersion returns empty for no references', async () => {
    const { version } = await setupReqWithVersion(db)
    const refs = await listReferencesForVersion(
      db as unknown as AppDatabase,
      version.id,
    )
    expect(refs).toEqual([])
  })

  it('createReference and list it', async () => {
    const { version } = await setupReqWithVersion(db)
    const ref = await createReference(db as unknown as AppDatabase, {
      requirementVersionId: version.id,
      name: 'RFC 1234',
      uri: 'https://example.com/rfc',
      owner: 'IETF',
    })
    expect(ref).toMatchObject({ name: 'RFC 1234' })

    const refs = await listReferencesForVersion(
      db as unknown as AppDatabase,
      version.id,
    )
    expect(refs).toHaveLength(1)
    expect(refs[0].name).toBe('RFC 1234')
  })

  it('updateReference changes fields', async () => {
    const { version } = await setupReqWithVersion(db)
    const ref = await createReference(db as unknown as AppDatabase, {
      requirementVersionId: version.id,
      name: 'Old Name',
    })

    const updated = await updateReference(
      db as unknown as AppDatabase,
      ref.id,
      { name: 'New Name', uri: 'https://new.example.com' },
    )
    expect(updated).toMatchObject({ name: 'New Name' })
  })

  it('deleteReference removes reference', async () => {
    const { version } = await setupReqWithVersion(db)
    const ref = await createReference(db as unknown as AppDatabase, {
      requirementVersionId: version.id,
      name: 'Temp',
    })

    await deleteReference(db as unknown as AppDatabase, ref.id)
    const refs = await listReferencesForVersion(
      db as unknown as AppDatabase,
      version.id,
    )
    expect(refs).toEqual([])
  })

  it('replaceReferencesForVersion updates, creates and deletes', async () => {
    const { version } = await setupReqWithVersion(db)
    // Create initial reference
    const ref1 = await createReference(db as unknown as AppDatabase, {
      requirementVersionId: version.id,
      name: 'Keep',
    })
    await createReference(db as unknown as AppDatabase, {
      requirementVersionId: version.id,
      name: 'Delete',
    })

    // Replace: keep ref1 (updated), add new, delete second
    await replaceReferencesForVersion(
      db as unknown as AppDatabase,
      version.id,
      [
        { id: ref1.id, name: 'Updated Keep', uri: 'https://upd.com' },
        { name: 'Brand New' },
      ],
    )

    const refs = await listReferencesForVersion(
      db as unknown as AppDatabase,
      version.id,
    )
    expect(refs).toHaveLength(2)
    const names = refs.map(r => r.name).sort()
    expect(names).toEqual(['Brand New', 'Updated Keep'])
  })
})
