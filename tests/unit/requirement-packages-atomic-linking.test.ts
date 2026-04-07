import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createPackage,
  getOrCreatePackageNeedsReference,
  linkRequirementsToPackageAtomically,
} from '@/lib/dal/requirement-packages'
import type { Database as AppDatabase } from '@/lib/db'

class FakeD1PreparedStatement {
  constructor(
    private readonly sqlite: BetterSqlite3.Database,
    private readonly query: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeD1PreparedStatement(this.sqlite, this.query, params)
  }

  allSync() {
    const results = this.sqlite
      .prepare(this.query)
      .all(...this.params) as Record<string, unknown>[]

    return {
      meta: { changes: 0, duration: 0, last_row_id: 0 },
      results,
      success: true,
    }
  }

  executeForBatch() {
    const normalizedQuery = this.query.trim().toUpperCase()

    if (normalizedQuery.startsWith('SELECT')) {
      return this.allSync()
    }

    return this.runSync()
  }

  async all() {
    return this.allSync()
  }

  async raw() {
    return this.sqlite
      .prepare(this.query)
      .raw(true)
      .all(...this.params) as unknown[][]
  }

  async run() {
    return this.runSync()
  }

  runSync() {
    const result = this.sqlite.prepare(this.query).run(...this.params)

    return {
      meta: {
        changes: result.changes,
        duration: 0,
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
      results: [],
      success: true,
    }
  }
}

class FakeD1Database {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  batch(statements: FakeD1PreparedStatement[]) {
    const executeBatch = this.sqlite.transaction(
      (preparedStatements: FakeD1PreparedStatement[]) =>
        preparedStatements.map(statement => statement.executeForBatch()),
    )

    return Promise.resolve(executeBatch(statements))
  }

  prepare(query: string) {
    return new FakeD1PreparedStatement(this.sqlite, query)
  }
}

function applyMigrations(sqlite: BetterSqlite3.Database) {
  const migrationsDir = join(process.cwd(), 'drizzle/migrations')
  const sqlFiles = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()

  for (const file of sqlFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmedStatement = statement.trim()
      if (trimmedStatement) {
        sqlite.exec(trimmedStatement)
      }
    }
  }
}

function createAsyncTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  applyMigrations(sqlite)

  const db = drizzle(new FakeD1Database(sqlite) as never, {
    schema,
  })

  return {
    db: db as unknown as AppDatabase,
    sqlite,
  }
}

type TestDb = ReturnType<typeof createAsyncTestDb>['db']

async function seedPublishedStatus(db: TestDb) {
  await db.insert(schema.requirementStatuses).values({
    color: '#22c55e',
    id: 3,
    isSystem: true,
    nameEn: 'Published',
    nameSv: 'Publicerad',
    sortOrder: 3,
  })
}

async function seedIncludedPackageItemStatus(db: TestDb) {
  await db.insert(schema.packageItemStatuses).values({
    color: '#94a3b8',
    id: 1,
    nameEn: 'Included',
    nameSv: 'Inkluderad',
    sortOrder: 1,
  })
}

describe('linkRequirementsToPackageAtomically', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = createAsyncTestDb())
    await seedIncludedPackageItemStatus(db)
  })

  it('creates and links a trimmed needs reference in one transaction', async () => {
    await seedPublishedStatus(db)

    const pkg = await createPackage(db, {
      name: 'Shared package',
      uniqueId: 'SHARED-PACKAGE',
    })

    await db.insert(schema.requirementAreas).values({
      description: null,
      id: 1,
      name: 'Platform',
      nextSequence: 1,
      ownerId: null,
      prefix: 'PLT',
    })
    await db.insert(schema.requirements).values({
      id: 1,
      requirementAreaId: 1,
      sequenceNumber: 1,
      uniqueId: 'PLT-001',
    })
    await db.insert(schema.requirementVersions).values({
      description: 'PLT-001 description',
      id: 101,
      requirementId: 1,
      requiresTesting: false,
      statusId: 3,
      versionNumber: 1,
    })

    const addedCount = await linkRequirementsToPackageAtomically(db, pkg.id, {
      items: [{ requirementId: 1, requirementVersionId: 101 }],
      needsReferenceText: '  Shared need  ',
    })

    const needsReferences = await db
      .select({
        id: schema.packageNeedsReferences.id,
        text: schema.packageNeedsReferences.text,
      })
      .from(schema.packageNeedsReferences)
      .where(eq(schema.packageNeedsReferences.packageId, pkg.id))
    const packageItems = await db
      .select({
        needsReferenceId: schema.requirementPackageItems.needsReferenceId,
      })
      .from(schema.requirementPackageItems)
      .where(eq(schema.requirementPackageItems.packageId, pkg.id))

    expect(addedCount).toBe(1)
    expect(needsReferences).toHaveLength(1)
    expect(needsReferences[0].text).toBe('Shared need')
    expect(packageItems).toEqual([{ needsReferenceId: needsReferences[0].id }])
  })

  it('rejects needsReferenceId values that belong to another package', async () => {
    await seedPublishedStatus(db)

    const [packageA, packageB] = await Promise.all([
      createPackage(db, {
        name: 'Package A',
        uniqueId: 'PACKAGE-A',
      }),
      createPackage(db, {
        name: 'Package B',
        uniqueId: 'PACKAGE-B',
      }),
    ])

    await db.insert(schema.requirementAreas).values({
      description: null,
      id: 1,
      name: 'Platform',
      nextSequence: 1,
      ownerId: null,
      prefix: 'PLT',
    })
    await db.insert(schema.requirements).values({
      id: 1,
      requirementAreaId: 1,
      sequenceNumber: 1,
      uniqueId: 'PLT-001',
    })
    await db.insert(schema.requirementVersions).values({
      description: 'PLT-001 description',
      id: 101,
      requirementId: 1,
      requiresTesting: false,
      statusId: 3,
      versionNumber: 1,
    })

    const foreignNeedsReferenceId = await getOrCreatePackageNeedsReference(
      db,
      packageB.id,
      'Needs reference B',
    )

    await expect(
      linkRequirementsToPackageAtomically(db, packageA.id, {
        items: [{ requirementId: 1, requirementVersionId: 101 }],
        needsReferenceId: foreignNeedsReferenceId,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'needsReferenceId does not belong to this requirement package',
    })

    const packageAItems = await db
      .select({ id: schema.requirementPackageItems.id })
      .from(schema.requirementPackageItems)
      .where(eq(schema.requirementPackageItems.packageId, packageA.id))
    const packageANeedsReferences = await db
      .select({ id: schema.packageNeedsReferences.id })
      .from(schema.packageNeedsReferences)
      .where(eq(schema.packageNeedsReferences.packageId, packageA.id))

    expect(packageAItems).toEqual([])
    expect(packageANeedsReferences).toEqual([])
  })

  it('rejects conflicting needs-reference inputs before linking', async () => {
    await seedPublishedStatus(db)

    const pkg = await createPackage(db, {
      name: 'Conflicting package',
      uniqueId: 'CONFLICTING-PACKAGE',
    })

    await db.insert(schema.requirementAreas).values({
      description: null,
      id: 1,
      name: 'Platform',
      nextSequence: 1,
      ownerId: null,
      prefix: 'PLT',
    })
    await db.insert(schema.requirements).values({
      id: 1,
      requirementAreaId: 1,
      sequenceNumber: 1,
      uniqueId: 'PLT-001',
    })
    await db.insert(schema.requirementVersions).values({
      description: 'PLT-001 description',
      id: 101,
      requirementId: 1,
      requiresTesting: false,
      statusId: 3,
      versionNumber: 1,
    })

    const needsReferenceId = await getOrCreatePackageNeedsReference(
      db,
      pkg.id,
      'Existing need',
    )

    await expect(
      linkRequirementsToPackageAtomically(db, pkg.id, {
        items: [{ requirementId: 1, requirementVersionId: 101 }],
        needsReferenceId,
        needsReferenceText: '  Conflicting need  ',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message:
        'Provide either needsReferenceId or needsReferenceText, not both',
    })
  })

  it('removes a newly created needs reference when all links already exist', async () => {
    await seedPublishedStatus(db)

    const pkg = await createPackage(db, {
      name: 'Duplicate package',
      uniqueId: 'DUPLICATE-PACKAGE',
    })

    await db.insert(schema.requirementAreas).values({
      description: null,
      id: 1,
      name: 'Platform',
      nextSequence: 1,
      ownerId: null,
      prefix: 'PLT',
    })
    await db.insert(schema.requirements).values({
      id: 1,
      requirementAreaId: 1,
      sequenceNumber: 1,
      uniqueId: 'PLT-001',
    })
    await db.insert(schema.requirementVersions).values({
      description: 'PLT-001 description',
      id: 101,
      requirementId: 1,
      requiresTesting: false,
      statusId: 3,
      versionNumber: 1,
    })
    await db.insert(schema.requirementPackageItems).values({
      packageId: pkg.id,
      requirementId: 1,
      requirementVersionId: 101,
    })

    const addedCount = await linkRequirementsToPackageAtomically(db, pkg.id, {
      items: [{ requirementId: 1, requirementVersionId: 101 }],
      needsReferenceText: 'Ephemeral need',
    })

    const needsReferences = await db
      .select({ id: schema.packageNeedsReferences.id })
      .from(schema.packageNeedsReferences)
      .where(eq(schema.packageNeedsReferences.packageId, pkg.id))

    expect(addedCount).toBe(0)
    expect(needsReferences).toEqual([])
  })

  it('rolls back a newly created needs reference when linking fails', async () => {
    const pkg = await createPackage(db, {
      name: 'Rollback package',
      uniqueId: 'ROLLBACK-PACKAGE',
    })

    await expect(
      linkRequirementsToPackageAtomically(db, pkg.id, {
        items: [{ requirementId: 999, requirementVersionId: 999 }],
        needsReferenceText: 'Rollback need',
      }),
    ).rejects.toBeInstanceOf(Error)

    const needsReferences = await db
      .select({
        id: schema.packageNeedsReferences.id,
        text: schema.packageNeedsReferences.text,
      })
      .from(schema.packageNeedsReferences)
      .where(eq(schema.packageNeedsReferences.packageId, pkg.id))
    const packageItems = await db
      .select({ id: schema.requirementPackageItems.id })
      .from(schema.requirementPackageItems)
      .where(eq(schema.requirementPackageItems.packageId, pkg.id))

    expect(needsReferences).toEqual([])
    expect(packageItems).toEqual([])
  })
})
