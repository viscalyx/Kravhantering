import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildUiTerminologyPayload,
  normalizeUiTerminology,
} from '@/lib/ui-terminology'

const routeState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getUiTerminology: vi.fn(),
  updateUiTerminology: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  formatUiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
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

  it('returns 500 when loading stored terminology fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getUiTerminology.mockRejectedValueOnce(
      new Error('terminology unavailable'),
    )

    try {
      const response = await GET()
      const body = (await response.json()) as { error?: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe('Failed to load terminology.')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load stored terminology',
        expect.objectContaining({
          message: 'terminology unavailable',
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
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

  it('returns 400 for malformed JSON request bodies', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/terminology', {
        body: '{',
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Malformed JSON body.')
    expect(routeState.updateUiTerminology).not.toHaveBeenCalled()
  })

  it('rejects payloads that duplicate an allowed key and omit another key', async () => {
    const terminology = normalizeUiTerminology([])
    const payload = buildUiTerminologyPayload(terminology)
    const duplicateKeyPayload = payload.map((entry, index) =>
      index === 1
        ? {
            ...entry,
            key: payload[0].key,
          }
        : entry,
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/terminology', {
        body: JSON.stringify({
          terminology: duplicateKeyPayload,
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe(
      'Each terminology key must be provided exactly once.',
    )
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
