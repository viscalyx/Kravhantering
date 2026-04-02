import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createPackage,
  deletePackage,
  getOrCreatePackageNeedsReference,
  getPackageById,
  listPackages,
  updatePackage,
} from '@/lib/dal/requirement-packages'
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

async function seedPublishedRequirement(
  db: TestDb,
  {
    areaId,
    areaName,
    prefix,
    requirementId,
    requirementUniqueId,
    versionId,
  }: {
    areaId: number
    areaName: string
    prefix: string
    requirementId: number
    requirementUniqueId: string
    versionId: number
  },
) {
  await db.insert(schema.requirementAreas).values({
    description: null,
    id: areaId,
    name: areaName,
    nextSequence: 1,
    ownerId: null,
    prefix,
  })
  await db.insert(schema.requirements).values({
    id: requirementId,
    requirementAreaId: areaId,
    sequenceNumber: 1,
    uniqueId: requirementUniqueId,
  })
  await db.insert(schema.requirementVersions).values({
    description: `${requirementUniqueId} description`,
    id: versionId,
    requirementId,
    requiresTesting: false,
    statusId: 3,
    versionNumber: 1,
  })
}

describe('requirement-packages DAL', () => {
  let db: TestDb

  beforeEach(() => {
    ;({ db } = createTestDb())
  })

  it('listPackages returns empty when no packages', async () => {
    const result = await listPackages(db as unknown as AppDatabase)
    expect(result).toEqual([])
  })

  it('createPackage and getPackageById', async () => {
    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Säkerhetspaket',
      uniqueId: 'SAKERHETSPAKET',
    })
    expect(pkg).toMatchObject({ name: 'Säkerhetspaket' })

    const found = await getPackageById(db as unknown as AppDatabase, pkg.id)
    expect(found).toBeTruthy()
  })

  it('updatePackage changes fields', async () => {
    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Gammal',
      uniqueId: 'GAMMAL',
    })

    const updated = await updatePackage(db as unknown as AppDatabase, pkg.id, {
      name: 'New',
    })
    expect(updated).toMatchObject({ name: 'New' })
  })

  it('deletePackage removes package', async () => {
    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Tmp',
      uniqueId: 'TMP',
    })

    await deletePackage(db as unknown as AppDatabase, pkg.id)
    const result = await listPackages(db as unknown as AppDatabase)
    expect(result).toEqual([])
  })

  it('listPackages preserves requirement area names with commas and double colons', async () => {
    await seedPublishedStatus(db)

    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Area package',
      uniqueId: 'AREA-PACKAGE',
    })

    await seedPublishedRequirement(db, {
      areaId: 1,
      areaName: 'Security, Platform',
      prefix: 'SEC',
      requirementId: 1,
      requirementUniqueId: 'SEC-001',
      versionId: 101,
    })
    await seedPublishedRequirement(db, {
      areaId: 2,
      areaName: 'Domain::Core',
      prefix: 'DOM',
      requirementId: 2,
      requirementUniqueId: 'DOM-001',
      versionId: 102,
    })

    await db.insert(schema.requirementPackageItems).values([
      {
        packageId: pkg.id,
        requirementId: 1,
        requirementVersionId: 101,
      },
      {
        packageId: pkg.id,
        requirementId: 2,
        requirementVersionId: 102,
      },
    ])

    const [result] = await listPackages(db as unknown as AppDatabase)

    expect(result?.requirementAreas).toHaveLength(2)
    expect(result?.requirementAreas).toEqual(
      expect.arrayContaining([
        { id: 1, name: 'Security, Platform' },
        { id: 2, name: 'Domain::Core' },
      ]),
    )
  })

  it('rejects package items that reference a needs reference from another package', async () => {
    await seedPublishedStatus(db)

    const [packageA, packageB] = await Promise.all([
      createPackage(db as unknown as AppDatabase, {
        name: 'Package A',
        uniqueId: 'PACKAGE-A',
      }),
      createPackage(db as unknown as AppDatabase, {
        name: 'Package B',
        uniqueId: 'PACKAGE-B',
      }),
    ])

    await seedPublishedRequirement(db, {
      areaId: 1,
      areaName: 'Platform',
      prefix: 'PLT',
      requirementId: 1,
      requirementUniqueId: 'PLT-001',
      versionId: 101,
    })

    const needsReferenceId = await getOrCreatePackageNeedsReference(
      db as unknown as AppDatabase,
      packageB.id,
      'Needs reference B',
    )

    await expect(
      db.insert(schema.requirementPackageItems).values({
        needsReferenceId,
        packageId: packageA.id,
        requirementId: 1,
        requirementVersionId: 101,
      }),
    ).rejects.toThrow()
  })

  it('deletePackage removes package items before needs references', async () => {
    await seedPublishedStatus(db)

    const pkg = await createPackage(db as unknown as AppDatabase, {
      name: 'Delete package',
      uniqueId: 'DELETE-PACKAGE',
    })

    await seedPublishedRequirement(db, {
      areaId: 1,
      areaName: 'Platform',
      prefix: 'PLT',
      requirementId: 1,
      requirementUniqueId: 'PLT-001',
      versionId: 101,
    })

    const needsReferenceId = await getOrCreatePackageNeedsReference(
      db as unknown as AppDatabase,
      pkg.id,
      'Needs reference',
    )

    await db.insert(schema.requirementPackageItems).values({
      needsReferenceId,
      packageId: pkg.id,
      requirementId: 1,
      requirementVersionId: 101,
    })

    await deletePackage(db as unknown as AppDatabase, pkg.id)

    const [packages, packageItems, needsReferences] = await Promise.all([
      db
        .select({ id: schema.requirementPackages.id })
        .from(schema.requirementPackages),
      db
        .select({ id: schema.requirementPackageItems.id })
        .from(schema.requirementPackageItems),
      db
        .select({ id: schema.packageNeedsReferences.id })
        .from(schema.packageNeedsReferences),
    ])

    expect(packages).toEqual([])
    expect(packageItems).toEqual([])
    expect(needsReferences).toEqual([])
  })
})
