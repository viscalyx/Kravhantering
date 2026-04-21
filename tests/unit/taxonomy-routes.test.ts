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
vi.mock('@/lib/dal/package-implementation-types', () => ({
  listPackageImplementationTypes: async () => [{ id: 1 }],
  createPackageImplementationType: async () => ({ id: 2 }),
  updatePackageImplementationType: (...a: unknown[]) => mockUpdateImpl(...a),
  deletePackageImplementationType: (...a: unknown[]) => mockDeleteImpl(...a),
}))

const mockUpdateLifecycle = vi.fn()
const mockDeleteLifecycle = vi.fn()
vi.mock('@/lib/dal/package-lifecycle-statuses', () => ({
  listPackageLifecycleStatuses: async () => [{ id: 1 }],
  createPackageLifecycleStatus: async () => ({ id: 2 }),
  updatePackageLifecycleStatus: (...a: unknown[]) => mockUpdateLifecycle(...a),
  deletePackageLifecycleStatus: (...a: unknown[]) => mockDeleteLifecycle(...a),
}))

const mockUpdateArea = vi.fn()
const mockDeleteArea = vi.fn()
vi.mock('@/lib/dal/package-responsibility-areas', () => ({
  listPackageResponsibilityAreas: async () => [{ id: 1 }],
  createPackageResponsibilityArea: async () => ({ id: 2 }),
  updatePackageResponsibilityArea: (...a: unknown[]) => mockUpdateArea(...a),
  deletePackageResponsibilityArea: (...a: unknown[]) => mockDeleteArea(...a),
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

const mockUpdatePkg = vi.fn()
const mockDeletePkg = vi.fn()
vi.mock('@/lib/dal/requirement-packages', () => ({
  listPackages: async () => [{ id: 1 }],
  createPackage: async () => ({ id: 2 }),
  updatePackage: (...a: unknown[]) => mockUpdatePkg(...a),
  deletePackage: (...a: unknown[]) => mockDeletePkg(...a),
  getPackageById: async (_db: unknown, id: number) => ({ id }),
  getPackageBySlug: async () => null,
  isSlugTaken: async () => false,
}))

const mockUpdateScenario = vi.fn()
const mockDeleteScenario = vi.fn()
vi.mock('@/lib/dal/usage-scenarios', () => ({
  listScenarios: async () => [{ id: 1 }],
  countLinkedRequirements: async () => ({}),
  createScenario: async () => ({ id: 2 }),
  updateScenario: (...a: unknown[]) => mockUpdateScenario(...a),
  deleteScenario: (...a: unknown[]) => mockDeleteScenario(...a),
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
  DELETE as deleteImplType,
  PUT as putImplType,
} from '@/app/api/package-implementation-types/[id]/route'
import {
  GET as getImplTypes,
  POST as postImplType,
} from '@/app/api/package-implementation-types/route'
import {
  DELETE as deleteLifecycle,
  PUT as putLifecycle,
} from '@/app/api/package-lifecycle-statuses/[id]/route'
import {
  GET as getLifecycleStatuses,
  POST as postLifecycle,
} from '@/app/api/package-lifecycle-statuses/route'
import {
  DELETE as deleteRespArea,
  PUT as putRespArea,
} from '@/app/api/package-responsibility-areas/[id]/route'
import {
  GET as getAreas,
  POST as postArea,
} from '@/app/api/package-responsibility-areas/route'
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
  DELETE as deletePkg,
  PUT as putPkg,
} from '@/app/api/requirement-packages/[id]/route'
import {
  GET as getPkgs,
  POST as postPkg,
} from '@/app/api/requirement-packages/route'
import { GET as getTypes } from '@/app/api/requirement-types/route'
import {
  DELETE as deleteScen,
  PUT as putScen,
} from '@/app/api/usage-scenarios/[id]/route'
import {
  GET as getScenarios,
  POST as postScenario,
} from '@/app/api/usage-scenarios/route'

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

describe('package-implementation-types routes', () => {
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

describe('package-lifecycle-statuses routes', () => {
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

describe('package-responsibility-areas routes', () => {
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

describe('requirement-packages routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns packages', async () => {
    const r = await getPkgs()
    const j = (await r.json()) as { packages: { id: number }[] }
    expect(j.packages).toHaveLength(1)
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

describe('usage-scenarios routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns scenarios', async () => {
    const r = await getScenarios()
    const j = (await r.json()) as { scenarios: { id: number }[] }
    expect(j.scenarios).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postScenario(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateScenario.mockResolvedValue({ id: 1 })
    const r = await putScen(jsonReq('PUT', { nameEn: 'X' }), makeParams('1'))
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('DELETE deletes', async () => {
    mockDeleteScenario.mockResolvedValue(undefined)
    const r = await deleteScen(
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
