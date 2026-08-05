import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  audit: vi.fn(),
  createQualityCharacteristic: vi.fn(),
  listCategories: vi.fn(),
  listQualityCharacteristics: vi.fn(),
  listPriorityLevels: vi.fn(),
  countLinkedRequirements: vi.fn(),
  getLinkedRequirements: vi.fn(),
  getPriorityLevelById: vi.fn(),
  listTypes: vi.fn(),
  updatePriorityLevel: vi.fn(),
  db: { marker: 'db' },
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => state.db),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-quality',
    request: {
      method: 'POST',
      path: '/api/quality-characteristics',
      requestId: 'request-quality',
    },
    requestId: 'request-quality',
    source: 'rest',
  })),
  recordAdminPrivilegedActionSucceeded: state.audit,
}))

vi.mock('@/lib/dal/requirement-categories', () => ({
  listCategories: state.listCategories,
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  createQualityCharacteristic: state.createQualityCharacteristic,
  listQualityCharacteristics: state.listQualityCharacteristics,
  listTypes: state.listTypes,
}))

vi.mock('@/lib/dal/priority-levels', () => ({
  countLinkedRequirements: state.countLinkedRequirements,
  getLinkedRequirements: state.getLinkedRequirements,
  getPriorityLevelById: state.getPriorityLevelById,
  listPriorityLevels: state.listPriorityLevels,
  updatePriorityLevel: state.updatePriorityLevel,
}))

import {
  GET as getPriorityLevel,
  PUT as updatePriorityLevel,
} from '@/app/api/priority-levels/[id]/route'
import { GET as getPriorityLevels } from '@/app/api/priority-levels/route'
import {
  POST as createQualityCharacteristic,
  GET as getQualityCharacteristics,
} from '@/app/api/quality-characteristics/route'
import { GET as getCategories } from '@/app/api/requirement-categories/route'
import { GET as getTypes } from '@/app/api/requirement-types/route'

describe('classification collection routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns requirement categories', async () => {
    state.listCategories.mockResolvedValue([{ id: 1, nameEn: 'Functional' }])
    const response = await getCategories()
    await expect(response.json()).resolves.toEqual({
      categories: [{ id: 1, nameEn: 'Functional' }],
    })
    expect(state.listCategories).toHaveBeenCalledWith(state.db)
  })

  it('returns requirement types', async () => {
    state.listTypes.mockResolvedValue([{ id: 1, nameEn: 'Functional' }])
    const response = await getTypes()
    await expect(response.json()).resolves.toEqual({
      types: [{ id: 1, nameEn: 'Functional' }],
    })
    expect(state.listTypes).toHaveBeenCalledWith(state.db)
  })

  it('defaults a missing linked-requirement count to zero', async () => {
    state.listPriorityLevels.mockResolvedValue([{ id: 7, code: 'P7' }])
    state.countLinkedRequirements.mockResolvedValue({})
    const response = await getPriorityLevels()
    await expect(response.json()).resolves.toEqual({
      priorityLevels: [{ id: 7, code: 'P7', linkedRequirementCount: 0 }],
    })
  })

  it('rejects an invalid priority id and returns not found for a missing one', async () => {
    const invalid = await getPriorityLevel(
      new NextRequest('https://example.test/api/priority-levels/nope'),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(invalid.status).toBe(400)

    state.getPriorityLevelById.mockResolvedValue(null)
    const missing = await getPriorityLevel(
      new NextRequest('https://example.test/api/priority-levels/99'),
      { params: Promise.resolve({ id: '99' }) },
    )
    expect(missing.status).toBe(404)
    expect(state.getLinkedRequirements).not.toHaveBeenCalled()
  })

  it('returns not found when a priority update does not reload a row', async () => {
    state.updatePriorityLevel.mockResolvedValue(undefined)
    const response = await updatePriorityLevel(
      new NextRequest('https://example.test/api/priority-levels/1', {
        body: JSON.stringify({ nameEn: 'Updated' }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(response.status).toBe(404)
    expect(state.audit).not.toHaveBeenCalled()
  })

  it('lists all quality characteristics when no filter is present', async () => {
    state.listQualityCharacteristics.mockResolvedValue([{ id: 1 }])
    const response = await getQualityCharacteristics(
      new NextRequest('https://example.test/api/quality-characteristics'),
    )
    await expect(response.json()).resolves.toEqual({
      qualityCharacteristics: [{ id: 1 }],
    })
    expect(state.listQualityCharacteristics).toHaveBeenCalledWith(state.db)
  })

  it('lists quality characteristics for a valid type', async () => {
    state.listQualityCharacteristics.mockResolvedValue([{ id: 2 }])
    const response = await getQualityCharacteristics(
      new NextRequest(
        'https://example.test/api/quality-characteristics?typeId=7',
      ),
    )
    await expect(response.json()).resolves.toEqual({
      qualityCharacteristics: [{ id: 2 }],
    })
    expect(state.listQualityCharacteristics).toHaveBeenCalledWith(state.db, 7)
  })

  it.each(['?typeId=zero', '?typeId=0', '?unknown=1', '?typeId=1&typeId=2'])(
    'rejects an invalid quality query %s',
    async query => {
      const response = await getQualityCharacteristics(
        new NextRequest(
          `https://example.test/api/quality-characteristics${query}`,
        ),
      )
      expect(response.status).toBe(400)
      expect(state.listQualityCharacteristics).not.toHaveBeenCalled()
    },
  )

  it('creates and audits a quality characteristic', async () => {
    state.createQualityCharacteristic.mockResolvedValue({
      chapterId: '3.1',
      id: 44,
      nameEn: 'Suitability',
      nameSv: 'Lamplighet',
      parentId: null,
      requirementTypeId: 2,
    })
    const response = await createQualityCharacteristic(
      new NextRequest('https://example.test/api/quality-characteristics', {
        body: JSON.stringify({
          chapterId: '3.1',
          nameEn: 'Suitability',
          nameSv: 'Lamplighet',
          parentId: null,
          requirementTypeId: 2,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(response.status).toBe(201)
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), {
      changedFields: [
        'chapterId',
        'nameEn',
        'nameSv',
        'parentId',
        'requirementTypeId',
      ],
      operation: 'create',
      resourceId: 44,
      resourceType: 'quality_characteristic',
    })
  })

  it.each([
    {},
    {
      chapterId: 'chapter',
      nameEn: 'English',
      nameSv: 'Svenska',
      requirementTypeId: 1,
    },
    {
      chapterId: '3.1',
      extra: true,
      nameEn: 'English',
      nameSv: 'Svenska',
      requirementTypeId: 1,
    },
  ])('rejects an invalid create body %#', async body => {
    const response = await createQualityCharacteristic(
      new NextRequest('https://example.test/api/quality-characteristics', {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(response.status).toBe(400)
    expect(state.createQualityCharacteristic).not.toHaveBeenCalled()
  })
})
