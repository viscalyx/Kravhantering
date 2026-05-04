import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── shared request DB mocks ─────────────────────────────────────── */

const routeState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(() => ({})),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

/* ── DAL mocks ───────────────────────────────────────────────────── */

const mockUpdateImpl = vi.fn()
const mockDeleteImpl = vi.fn()
vi.mock('@/lib/dal/specification-implementation-types', () => ({
  listSpecificationImplementationTypes: async () => [{ id: 1 }],
  createSpecificationImplementationType: async () => ({ id: 2 }),
  updateSpecificationImplementationType: (...a: unknown[]) =>
    mockUpdateImpl(...a),
  deleteSpecificationImplementationType: (...a: unknown[]) =>
    mockDeleteImpl(...a),
}))

const mockUpdateLifecycle = vi.fn()
const mockDeleteLifecycle = vi.fn()
vi.mock('@/lib/dal/specification-lifecycle-statuses', () => ({
  listSpecificationLifecycleStatuses: async () => [{ id: 1 }],
  createSpecificationLifecycleStatus: async () => ({ id: 2 }),
  updateSpecificationLifecycleStatus: (...a: unknown[]) =>
    mockUpdateLifecycle(...a),
  deleteSpecificationLifecycleStatus: (...a: unknown[]) =>
    mockDeleteLifecycle(...a),
}))

const mockUpdateArea = vi.fn()
const mockDeleteArea = vi.fn()
vi.mock('@/lib/dal/specification-responsibility-areas', () => ({
  listSpecificationResponsibilityAreas: async () => [{ id: 1 }],
  createSpecificationResponsibilityArea: async () => ({ id: 2 }),
  updateSpecificationResponsibilityArea: (...a: unknown[]) =>
    mockUpdateArea(...a),
  deleteSpecificationResponsibilityArea: (...a: unknown[]) =>
    mockDeleteArea(...a),
}))

const mockUpdateReqArea = vi.fn()
const mockDeleteReqArea = vi.fn()
vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreas: async () => [{ id: 1 }],
  createArea: async () => ({ id: 2 }),
  updateArea: (...a: unknown[]) => mockUpdateReqArea(...a),
  deleteArea: (...a: unknown[]) => mockDeleteReqArea(...a),
}))

vi.mock('@/lib/dal/owners', () => ({
  listOwners: async () => [],
}))

const mockListSpecItemStatuses = vi.fn(async (..._args: unknown[]) => [
  { id: 5, nameEn: 'Deviated', nameSv: 'Avviken' },
])
const mockCountLinkedSpecificationItems = vi.fn(
  async (..._args: unknown[]) => ({
    5: 3,
  }),
)
const mockCreateSpecItemStatus = vi.fn(async (..._args: unknown[]) => ({
  id: 6,
}))
const mockGetSpecItemStatus = vi.fn(async (..._args: unknown[]) => ({ id: 5 }))
const mockGetLinkedSpecificationItems = vi.fn(async (..._args: unknown[]) => [])
const mockUpdateSpecItemStatus = vi.fn()
const mockDeleteSpecItemStatus = vi.fn()
vi.mock('@/lib/dal/specification-item-statuses', () => ({
  countLinkedSpecificationItems: (...a: unknown[]) =>
    mockCountLinkedSpecificationItems(...a),
  createSpecificationItemStatus: (...a: unknown[]) =>
    mockCreateSpecItemStatus(...a),
  deleteSpecificationItemStatus: (...a: unknown[]) =>
    mockDeleteSpecItemStatus(...a),
  getLinkedSpecificationItems: (...a: unknown[]) =>
    mockGetLinkedSpecificationItems(...a),
  getSpecificationItemStatusById: (...a: unknown[]) =>
    mockGetSpecItemStatus(...a),
  listSpecificationItemStatuses: (...a: unknown[]) =>
    mockListSpecItemStatuses(...a),
  updateSpecificationItemStatus: (...a: unknown[]) =>
    mockUpdateSpecItemStatus(...a),
}))

const mockUpdatePkg = vi.fn()
const mockDeletePkg = vi.fn()
vi.mock('@/lib/dal/requirements-specifications', () => ({
  listSpecifications: async () => [{ id: 1 }],
  createSpecification: async () => ({ id: 2 }),
  updateSpecification: (...a: unknown[]) => mockUpdatePkg(...a),
  deleteSpecification: (...a: unknown[]) => mockDeletePkg(...a),
  getSpecificationById: async (_db: unknown, id: number) => ({ id }),
  getSpecificationBySlug: async () => null,
  isSlugTaken: async () => false,
}))

const mockUpdateRequirementPackage = vi.fn()
const mockDeleteRequirementPackage = vi.fn()
vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: async () => [{ id: 1 }],
  countLinkedRequirementsByPackage: async () => ({}),
  createRequirementPackage: async () => ({ id: 2 }),
  updateRequirementPackage: (...a: unknown[]) =>
    mockUpdateRequirementPackage(...a),
  deleteRequirementPackage: (...a: unknown[]) =>
    mockDeleteRequirementPackage(...a),
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  listTypes: async () => [{ id: 1 }],
  listQualityCharacteristics: async () => [{ id: 10 }],
  createQualityCharacteristic: async () => ({ id: 20 }),
}))

vi.mock('@/lib/dal/requirement-categories', () => ({
  listCategories: async () => [{ id: 1 }],
}))

/* ── imports ─────────────────────────────────────────────────────── */

import {
  DELETE as deleteSpecItemStatus,
  GET as getSpecItemStatus,
  PUT as putSpecItemStatus,
} from '@/app/api/catalog/specification-item-statuses/[id]/route'
import {
  GET as getSpecItemStatuses,
  POST as postSpecItemStatus,
} from '@/app/api/catalog/specification-item-statuses/route'
import {
  GET as getTypeCats,
  POST as postTypeCat,
} from '@/app/api/quality-characteristics/route'
import {
  DELETE as deleteReqArea,
  PUT as putReqArea,
} from '@/app/api/requirement-areas/[id]/route'
import {
  GET as getReqAreas,
  POST as postReqArea,
} from '@/app/api/requirement-areas/route'
import { GET as getCats } from '@/app/api/requirement-categories/route'
import {
  DELETE as deleteRequirementPackage,
  PUT as putRequirementPackage,
} from '@/app/api/requirement-packages/[id]/route'
import {
  GET as getRequirementPackages,
  POST as postRequirementPackage,
} from '@/app/api/requirement-packages/route'
import { GET as getTypes } from '@/app/api/requirement-types/route'
import {
  DELETE as deleteImplType,
  PUT as putImplType,
} from '@/app/api/specification-implementation-types/[id]/route'
import {
  GET as getImplTypes,
  POST as postImplType,
} from '@/app/api/specification-implementation-types/route'
import {
  DELETE as deleteLifecycle,
  PUT as putLifecycle,
} from '@/app/api/specification-lifecycle-statuses/[id]/route'
import {
  GET as getLifecycleStatuses,
  POST as postLifecycle,
} from '@/app/api/specification-lifecycle-statuses/route'
import {
  DELETE as deleteRespArea,
  PUT as putRespArea,
} from '@/app/api/specification-responsibility-areas/[id]/route'
import {
  GET as getAreas,
  POST as postArea,
} from '@/app/api/specification-responsibility-areas/route'
import {
  DELETE as deletePkg,
  PUT as putPkg,
} from '@/app/api/specifications/[id]/route'
import { GET as getPkgs, POST as postPkg } from '@/app/api/specifications/route'

/* ── helpers ─────────────────────────────────────────────────────── */

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonReq(method: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/* ── tests ───────────────────────────────────────────────────────── */

describe('specification-implementation-types routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns types', async () => {
    const r = await getImplTypes()
    const j = (await r.json()) as { types: { id: number }[] }
    expect(j.types).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postImplType(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateImpl.mockResolvedValue({ id: 1 })
    const r = await putImplType(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('DELETE deletes', async () => {
    mockDeleteImpl.mockResolvedValue(undefined)
    const r = await deleteImplType(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('specification-lifecycle-statuses routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns statuses', async () => {
    const r = await getLifecycleStatuses()
    const j = (await r.json()) as { statuses: { id: number }[] }
    expect(j.statuses).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postLifecycle(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateLifecycle.mockResolvedValue({ id: 1 })
    const r = await putLifecycle(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('DELETE deletes', async () => {
    mockDeleteLifecycle.mockResolvedValue(undefined)
    const r = await deleteLifecycle(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('specification-responsibility-areas routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns areas', async () => {
    const r = await getAreas()
    const j = (await r.json()) as { areas: { id: number }[] }
    expect(j.areas).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postArea(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateArea.mockResolvedValue({ id: 1 })
    const r = await putRespArea(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('DELETE deletes', async () => {
    mockDeleteArea.mockResolvedValue(undefined)
    const r = await deleteRespArea(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('returns 400 for invalid ids before opening the DB', async () => {
    const r = await putRespArea(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('abc'),
    )

    expect(r.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdateArea).not.toHaveBeenCalled()
  })

  it('returns 404 when updating a missing responsibility area', async () => {
    mockUpdateArea.mockResolvedValue(undefined)
    const r = await putRespArea(
      jsonReq('PUT', { nameEn: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ message: 'Not found' })
  })
})

describe('specification-item-statuses catalog routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns catalog statuses with linked item counts', async () => {
    const r = await getSpecItemStatuses()

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({
      statuses: [
        {
          id: 5,
          isDeviationStatus: true,
          linkedItemCount: 3,
          nameEn: 'Deviated',
          nameSv: 'Avviken',
        },
      ],
    })
  })

  it('POST creates a catalog status with 201', async () => {
    const r = await postSpecItemStatus(
      new Request('http://l', {
        body: '{"nameSv":"Ny","nameEn":"New"}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(r.status).toBe(201)
  })

  it('GET by id returns linked specification items', async () => {
    const r = await getSpecItemStatus(
      new NextRequest('http://l', { method: 'GET' }),
      makeParams('5'),
    )

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({
      linkedItems: [],
      status: { id: 5 },
    })
  })

  it('PUT returns 404 when the catalog status is missing', async () => {
    mockUpdateSpecItemStatus.mockResolvedValue(undefined)
    const r = await putSpecItemStatus(
      jsonReq('PUT', { nameEn: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('DELETE removes a catalog status', async () => {
    const r = await deleteSpecItemStatus(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('5'),
    )

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({ ok: true })
  })
})

describe('requirement-areas routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns areas', async () => {
    const r = await getReqAreas()
    const j = (await r.json()) as { areas: { id: number }[] }
    expect(j.areas).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postReqArea(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"Test area"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
})

describe('requirement-areas/[id] routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUT updates', async () => {
    mockUpdateReqArea.mockResolvedValue({ id: 1 })
    const r = await putReqArea(jsonReq('PUT', { name: 'X' }), makeParams('1'))
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('DELETE deletes', async () => {
    mockDeleteReqArea.mockResolvedValue(undefined)
    const r = await deleteReqArea(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('returns 400 for invalid ids before opening the DB', async () => {
    const r = await deleteReqArea(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('abc'),
    )

    expect(r.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockDeleteReqArea).not.toHaveBeenCalled()
  })
})

describe('requirement-specifications routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns specifications', async () => {
    const r = await getPkgs()
    const j = (await r.json()) as { specifications: { id: number }[] }
    expect(j.specifications).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postPkg(
      new NextRequest('http://l', {
        method: 'POST',
        body: '{"name":"A","uniqueId":"A"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdatePkg.mockResolvedValue({ id: 1 })
    const r = await putPkg(jsonReq('PUT', { nameEn: 'X' }), makeParams('1'))
    await expect(r.json()).resolves.toEqual({ id: 1 })
  })
  it('DELETE deletes', async () => {
    mockDeletePkg.mockResolvedValue(undefined)
    const r = await deletePkg(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('requirement-packages routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns requirementPackages', async () => {
    const r = await getRequirementPackages()
    const j = (await r.json()) as { requirementPackages: { id: number }[] }
    expect(j.requirementPackages).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postRequirementPackage(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateRequirementPackage.mockResolvedValue({ id: 1 })
    const r = await putRequirementPackage(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('DELETE deletes', async () => {
    mockDeleteRequirementPackage.mockResolvedValue(undefined)
    const r = await deleteRequirementPackage(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('read-only taxonomy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requirement-types GET returns types', async () => {
    const r = await getTypes()
    const j = (await r.json()) as { types: { id: number }[] }
    expect(j.types).toHaveLength(1)
  })

  it('quality-characteristics GET returns categories', async () => {
    const req = new NextRequest('http://l/api/quality-characteristics')
    const r = await getTypeCats(req)
    const j = (await r.json()) as { qualityCharacteristics: { id: number }[] }
    expect(j.qualityCharacteristics).toHaveLength(1)
  })

  it('quality-characteristics GET with typeId filter', async () => {
    const req = new NextRequest('http://l/api/quality-characteristics?typeId=1')
    const r = await getTypeCats(req)
    const j = (await r.json()) as { qualityCharacteristics: { id: number }[] }
    expect(j.qualityCharacteristics).toHaveLength(1)
  })

  it('quality-characteristics GET returns 400 for invalid typeId', async () => {
    const req = new NextRequest(
      'http://l/api/quality-characteristics?typeId=abc',
    )
    const r = await getTypeCats(req)
    expect(r.status).toBe(400)
    const j = (await r.json()) as { error: string }
    expect(j.error).toBe('Invalid typeId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('quality-characteristics POST creates with 201', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({
          nameSv: 'Sv',
          nameEn: 'En',
          requirementTypeId: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })

  it('quality-characteristics POST returns 400 for invalid payload', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({ nameSv: 'Sv' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    const j = (await r.json()) as { error: string }
    expect(j.error).toBe('Invalid payload')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('quality-characteristics POST returns 400 for invalid parentId', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({
          nameSv: 'Sv',
          nameEn: 'En',
          requirementTypeId: 1,
          parentId: 'abc',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    const j = (await r.json()) as { error: string }
    expect(j.error).toBe('Invalid payload')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('requirement-categories GET returns categories', async () => {
    const r = await getCats()
    const j = (await r.json()) as { categories: { id: number }[] }
    expect(j.categories).toHaveLength(1)
  })
})
