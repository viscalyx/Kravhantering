import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  countRequirements,
  listRequirements,
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_REVIEW,
} from '@/lib/dal/requirements'
import type { Database as AppDatabase } from '@/lib/db'

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  const migrationFiles = ['0000_violet_thunderbolts.sql']

  for (const file of migrationFiles) {
    const migrationSql = readFileSync(
      join(process.cwd(), `drizzle/migrations/${file}`),
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

type TestDb = ReturnType<typeof createTestDb>['db']

async function seedLookups(db: TestDb) {
  await db.insert(schema.requirementStatuses).values([
    {
      color: '#3b82f6',
      id: STATUS_DRAFT,
      isSystem: true,
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
    },
    {
      color: '#eab308',
      id: STATUS_REVIEW,
      isSystem: true,
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
    },
    {
      color: '#22c55e',
      id: 3,
      isSystem: true,
      nameEn: 'Published',
      nameSv: 'Publicerad',
      sortOrder: 3,
    },
    {
      color: '#6b7280',
      id: STATUS_ARCHIVED,
      isSystem: true,
      nameEn: 'Archived',
      nameSv: 'Arkiverad',
      sortOrder: 4,
    },
  ])

  await db.insert(schema.requirementAreas).values({
    id: 1,
    name: 'Archived area',
    prefix: 'ARC',
  })
}

async function seedArchivedRequirement(
  db: TestDb,
  input: {
    archivedDescription: string
    id: number
    pendingDescription: string
    pendingStatusId: number
    uniqueId: string
  },
) {
  await db.insert(schema.requirements).values({
    id: input.id,
    isArchived: true,
    requirementAreaId: 1,
    sequenceNumber: input.id,
    uniqueId: input.uniqueId,
  })

  await db.insert(schema.requirementVersions).values([
    {
      archivedAt: '2026-03-01T00:00:00.000Z',
      description: input.archivedDescription,
      publishedAt: '2026-02-28T00:00:00.000Z',
      requirementId: input.id,
      statusId: STATUS_ARCHIVED,
      versionNumber: 1,
    },
    {
      description: input.pendingDescription,
      editedAt: '2026-03-02T00:00:00.000Z',
      requirementId: input.id,
      statusId: input.pendingStatusId,
      versionNumber: 2,
    },
  ])
}

async function seedRequirement(
  db: TestDb,
  input: {
    categoryId?: number | null
    id: number
    statusId: number
    uniqueId: string
    versionNumber: number
  },
) {
  await db.insert(schema.requirements).values({
    id: input.id,
    isArchived: input.statusId === STATUS_ARCHIVED,
    requirementAreaId: 1,
    sequenceNumber: input.id,
    uniqueId: input.uniqueId,
  })

  await db.insert(schema.requirementVersions).values({
    createdAt: '2026-03-01T00:00:00.000Z',
    description: `Requirement ${input.uniqueId}`,
    publishedAt: input.statusId === 3 ? '2026-03-01T00:00:00.000Z' : undefined,
    requirementCategoryId: input.categoryId ?? undefined,
    requirementId: input.id,
    statusId: input.statusId,
    versionNumber: input.versionNumber,
  })
}

describe('requirements DAL list semantics', () => {
  it('uses the archived version as the list display version when a newer draft or review exists', async () => {
    const { db, sqlite } = createTestDb()

    try {
      await seedLookups(db)
      await seedArchivedRequirement(db, {
        archivedDescription: 'Archived requirement with draft replacement',
        id: 1,
        pendingDescription: 'Draft replacement',
        pendingStatusId: STATUS_DRAFT,
        uniqueId: 'ARC0001',
      })
      await seedArchivedRequirement(db, {
        archivedDescription: 'Archived requirement with review replacement',
        id: 2,
        pendingDescription: 'Review replacement',
        pendingStatusId: STATUS_REVIEW,
        uniqueId: 'ARC0002',
      })

      const rows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
      })

      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({
        description: 'Archived requirement with draft replacement',
        maxVersion: 2,
        pendingVersionStatusColor: '#3b82f6',
        pendingVersionStatusId: STATUS_DRAFT,
        status: STATUS_ARCHIVED,
        statusNameEn: 'Archived',
        uniqueId: 'ARC0001',
        versionNumber: 1,
      })
      expect(rows[1]).toMatchObject({
        description: 'Archived requirement with review replacement',
        maxVersion: 2,
        pendingVersionStatusColor: '#eab308',
        pendingVersionStatusId: STATUS_REVIEW,
        status: STATUS_ARCHIVED,
        statusNameEn: 'Archived',
        uniqueId: 'ARC0002',
        versionNumber: 1,
      })
    } finally {
      sqlite.close()
    }
  })

  it('keeps countRequirements aligned with archived effective status filtering', async () => {
    const { db, sqlite } = createTestDb()

    try {
      await seedLookups(db)
      await seedArchivedRequirement(db, {
        archivedDescription: 'Archived requirement with draft replacement',
        id: 1,
        pendingDescription: 'Draft replacement',
        pendingStatusId: STATUS_DRAFT,
        uniqueId: 'ARC0001',
      })
      await seedArchivedRequirement(db, {
        archivedDescription: 'Archived requirement with review replacement',
        id: 2,
        pendingDescription: 'Review replacement',
        pendingStatusId: STATUS_REVIEW,
        uniqueId: 'ARC0002',
      })

      const archivedRows = await listRequirements(
        db as unknown as AppDatabase,
        {
          includeArchived: true,
          statuses: [STATUS_ARCHIVED],
        },
      )
      const archivedCount = await countRequirements(
        db as unknown as AppDatabase,
        {
          includeArchived: true,
          statuses: [STATUS_ARCHIVED],
        },
      )
      const draftCount = await countRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        statuses: [STATUS_DRAFT],
      })

      expect(archivedRows).toHaveLength(2)
      expect(archivedCount).toBe(2)
      expect(draftCount).toBe(0)
    } finally {
      sqlite.close()
    }
  })

  it('sorts by locale-specific text columns and keeps empty values last', async () => {
    const { db, sqlite } = createTestDb()

    try {
      await seedLookups(db)
      await db.insert(schema.requirementCategories).values([
        { id: 1, nameEn: 'Alpha', nameSv: 'Zulu' },
        { id: 2, nameEn: 'Omega', nameSv: 'Alfa' },
      ])
      await seedRequirement(db, {
        categoryId: 1,
        id: 1,
        statusId: 3,
        uniqueId: 'ARC0001',
        versionNumber: 1,
      })
      await seedRequirement(db, {
        categoryId: 2,
        id: 2,
        statusId: 3,
        uniqueId: 'ARC0002',
        versionNumber: 1,
      })
      await seedRequirement(db, {
        categoryId: null,
        id: 3,
        statusId: 3,
        uniqueId: 'ARC0003',
        versionNumber: 1,
      })

      const svRows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        locale: 'sv',
        sortBy: 'category',
      })
      const enRows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        locale: 'en',
        sortBy: 'category',
      })

      expect(svRows.map(row => row.uniqueId)).toEqual([
        'ARC0002',
        'ARC0001',
        'ARC0003',
      ])
      expect(enRows.map(row => row.uniqueId)).toEqual([
        'ARC0001',
        'ARC0002',
        'ARC0003',
      ])
    } finally {
      sqlite.close()
    }
  })

  it('sorts by status workflow order and version with uniqueId tie-breakers', async () => {
    const { db, sqlite } = createTestDb()

    try {
      await seedLookups(db)
      await seedRequirement(db, {
        id: 1,
        statusId: STATUS_DRAFT,
        uniqueId: 'ARC0002',
        versionNumber: 3,
      })
      await seedRequirement(db, {
        id: 2,
        statusId: STATUS_DRAFT,
        uniqueId: 'ARC0001',
        versionNumber: 3,
      })
      await seedRequirement(db, {
        id: 3,
        statusId: STATUS_REVIEW,
        uniqueId: 'ARC0003',
        versionNumber: 1,
      })

      const statusRows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        sortBy: 'status',
      })
      const versionRows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        sortBy: 'version',
        sortDirection: 'desc',
      })

      expect(statusRows.map(row => row.uniqueId)).toEqual([
        'ARC0001',
        'ARC0002',
        'ARC0003',
      ])
      expect(versionRows.map(row => row.uniqueId)).toEqual([
        'ARC0001',
        'ARC0002',
        'ARC0003',
      ])
    } finally {
      sqlite.close()
    }
  })

  it('filters by descriptionSearch, typeIds, qualityCharacteristicIds, and requiresTesting', async () => {
    const { db, sqlite } = createTestDb()

    try {
      await seedLookups(db)
      await db.insert(schema.requirementTypes).values({
        id: 1,
        nameEn: 'Functional',
        nameSv: 'Funktionellt',
      })
      await db.insert(schema.qualityCharacteristics).values({
        id: 1,
        nameEn: 'Maintainability',
        nameSv: 'Underhållbarhet',
        requirementTypeId: 1,
      })

      await db.insert(schema.requirements).values({
        id: 1,
        isArchived: false,
        requirementAreaId: 1,
        sequenceNumber: 1,
        uniqueId: 'ARC0001',
      })
      await db.insert(schema.requirementVersions).values({
        description: 'Secure integration test',
        qualityCharacteristicId: 1,
        requirementId: 1,
        requirementTypeId: 1,
        requiresTesting: true,
        statusId: 3,
        publishedAt: '2026-03-01T00:00:00.000Z',
        versionNumber: 1,
      })

      await db.insert(schema.requirements).values({
        id: 2,
        isArchived: false,
        requirementAreaId: 1,
        sequenceNumber: 2,
        uniqueId: 'ARC0002',
      })
      await db.insert(schema.requirementVersions).values({
        description: 'General requirement',
        requirementId: 2,
        requiresTesting: false,
        statusId: 3,
        publishedAt: '2026-03-01T00:00:00.000Z',
        versionNumber: 1,
      })

      const byDesc = await listRequirements(db as unknown as AppDatabase, {
        descriptionSearch: 'Secure',
        includeArchived: true,
      })
      expect(byDesc).toHaveLength(1)
      expect(byDesc[0].uniqueId).toBe('ARC0001')

      const byType = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        typeIds: [1],
      })
      expect(byType).toHaveLength(1)
      expect(byType[0].uniqueId).toBe('ARC0001')

      const byQc = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        qualityCharacteristicIds: [1],
      })
      expect(byQc).toHaveLength(1)
      expect(byQc[0].uniqueId).toBe('ARC0001')

      const byTesting = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        requiresTesting: [true],
      })
      expect(byTesting).toHaveLength(1)
      expect(byTesting[0].uniqueId).toBe('ARC0001')
    } finally {
      sqlite.close()
    }
  })

  it('sorts by description and area with empty values last', async () => {
    const { db, sqlite } = createTestDb()

    try {
      await seedLookups(db)

      await db.insert(schema.requirementAreas).values([
        { id: 2, name: 'Zulu area', prefix: 'ZUL' },
        { id: 3, name: '', prefix: 'EMP' },
      ])

      await db.insert(schema.requirements).values({
        id: 1,
        isArchived: false,
        requirementAreaId: 1,
        sequenceNumber: 1,
        uniqueId: 'ARC0001',
      })
      await db.insert(schema.requirementVersions).values({
        description: 'Zulu description',
        requirementId: 1,
        statusId: 3,
        publishedAt: '2026-03-01T00:00:00.000Z',
        versionNumber: 1,
      })

      await db.insert(schema.requirements).values({
        id: 2,
        isArchived: false,
        requirementAreaId: 2,
        sequenceNumber: 2,
        uniqueId: 'ARC0002',
      })
      await db.insert(schema.requirementVersions).values({
        description: 'Alpha description',
        requirementId: 2,
        statusId: 3,
        publishedAt: '2026-03-01T00:00:00.000Z',
        versionNumber: 1,
      })

      await db.insert(schema.requirements).values({
        id: 3,
        isArchived: false,
        requirementAreaId: 3,
        sequenceNumber: 3,
        uniqueId: 'ARC0003',
      })
      await db.insert(schema.requirementVersions).values({
        description: '',
        requirementId: 3,
        statusId: 3,
        publishedAt: '2026-03-01T00:00:00.000Z',
        versionNumber: 1,
      })

      const descRows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        sortBy: 'description',
      })
      expect(descRows.map(r => r.uniqueId)).toEqual([
        'ARC0002',
        'ARC0001',
        'ARC0003',
      ])

      const areaRows = await listRequirements(db as unknown as AppDatabase, {
        includeArchived: true,
        sortBy: 'area',
      })
      expect(areaRows.map(r => r.uniqueId)).toEqual([
        'ARC0001',
        'ARC0002',
        'ARC0003',
      ])
    } finally {
      sqlite.close()
    }
  })
})
