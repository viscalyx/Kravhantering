import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildUiTerminologyPayload,
  normalizeUiTerminology,
} from '@/lib/ui-terminology'

const routeState = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: {} } })),
  getDb: vi.fn(() => ({ db: true })),
  getUiTerminology: vi.fn(),
  updateUiTerminology: vi.fn(),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: routeState.getCloudflareContext,
}))

vi.mock('@/lib/db', () => ({
  getDb: routeState.getDb,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  getUiTerminology: routeState.getUiTerminology,
  updateUiTerminology: routeState.updateUiTerminology,
}))

import { GET, PUT } from '@/app/api/admin/terminology/route'

describe('admin terminology route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Requirement texts',
          plural: 'Requirement texts',
          singular: 'Requirement text',
        },
        key: 'description',
        sv: {
          definitePlural: 'Kravtexterna',
          plural: 'Kravtexter',
          singular: 'Kravtext',
        },
      },
    ])

    routeState.getUiTerminology.mockResolvedValue(terminology)
    routeState.updateUiTerminology.mockResolvedValue(terminology)
  })

  it('returns the stored terminology payload', async () => {
    const response = await GET()
    const body = (await response.json()) as { terminology?: unknown[] }

    expect(response.status).toBe(200)
    expect(body.terminology).toEqual(
      buildUiTerminologyPayload(
        normalizeUiTerminology([
          {
            en: {
              definitePlural: 'Requirement texts',
              plural: 'Requirement texts',
              singular: 'Requirement text',
            },
            key: 'description',
            sv: {
              definitePlural: 'Kravtexterna',
              plural: 'Kravtexter',
              singular: 'Kravtext',
            },
          },
        ]),
      ),
    )
  })

  it('rejects unknown terminology keys', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/terminology', {
        body: JSON.stringify({
          terminology: [
            {
              en: {
                definitePlural: 'Unknowns',
                plural: 'Unknowns',
                singular: 'Unknown',
              },
              key: 'unknownTerm',
              sv: {
                definitePlural: 'Okända',
                plural: 'Okända',
                singular: 'Okänd',
              },
            },
          ],
        }),
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateUiTerminology).not.toHaveBeenCalled()
  })

  it('saves a valid terminology payload and returns the normalized response body', async () => {
    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Requirement texts',
          plural: 'Requirement texts',
          singular: 'Requirement text',
        },
        key: 'description',
        sv: {
          definitePlural: 'Kravtexterna',
          plural: 'Kravtexter',
          singular: 'Kravtext',
        },
      },
    ])

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/terminology', {
        body: JSON.stringify({
          terminology: buildUiTerminologyPayload(terminology),
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { terminology?: unknown[] }

    expect(response.status).toBe(200)
    expect(routeState.updateUiTerminology).toHaveBeenCalledWith(
      { db: true },
      buildUiTerminologyPayload(terminology),
    )
    expect(body.terminology).toEqual(buildUiTerminologyPayload(terminology))
  })

  it('returns a structured error response when saving terminology fails', async () => {
    routeState.updateUiTerminology.mockRejectedValueOnce(
      new Error('write failed'),
    )

    const terminology = normalizeUiTerminology([
      {
        en: {
          definitePlural: 'Requirement texts',
          plural: 'Requirement texts',
          singular: 'Requirement text',
        },
        key: 'description',
        sv: {
          definitePlural: 'Kravtexterna',
          plural: 'Kravtexter',
          singular: 'Kravtext',
        },
      },
    ])

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/terminology', {
        body: JSON.stringify({
          terminology: buildUiTerminologyPayload(terminology),
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(500)
    expect(body.error).toBe('Failed to save terminology.')
  })
})
