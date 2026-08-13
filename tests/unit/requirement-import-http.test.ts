import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import { importCapacityBusyError } from '@/lib/requirements/errors'
import type { RequirementImportBudget } from '@/lib/requirements/import-budget'
import {
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
  REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES,
} from '@/lib/requirements/import-budget'
import {
  createRequirementImportBodyReader,
  readRequirementImportRequest,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'

const readerState = vi.hoisted(() => ({
  db: { query: vi.fn() },
  getApplicationSettings: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: readerState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: readerState.getApplicationSettings,
}))

const budget: RequirementImportBudget = {
  maxJsonDepth: 4,
  maxNestedItems: 1,
  maxProposedNeedsReferences: 1,
  maxProposedNormReferences: 1,
  maxRows: 1,
}

function request(body: unknown): Request {
  return new Request('https://example.test/api/requirements/import/preview', {
    body: JSON.stringify(body),
    method: 'POST',
  })
}

describe('requirement import HTTP reader', () => {
  it('loads the current budget before building and applying the route schema', async () => {
    readerState.getRequestSqlServerDataSource.mockResolvedValueOnce(
      readerState.db,
    )
    readerState.getApplicationSettings.mockResolvedValueOnce({
      ...DEFAULT_APPLICATION_SETTINGS,
      requirementImportMaxRows: 1,
    })
    const schema = vi.fn(() =>
      z.object({ payload: z.object({ requirements: z.array(z.object({})) }) }),
    )
    const content = vi.fn(
      (body: unknown) => (body as { payload: unknown }).payload,
    )
    const readBody = createRequirementImportBodyReader({ content, schema })

    const result = await readBody({
      request: request({ payload: { requirements: [{}] } }),
    })

    expect(result.ok).toBe(true)
    expect(readerState.getApplicationSettings).toHaveBeenCalledWith(
      readerState.db,
    )
    expect(schema).toHaveBeenCalledWith(expect.objectContaining({ maxRows: 1 }))
    expect(content).toHaveBeenCalledOnce()
  })

  it('maps capacity rejection to stable 429 retry metadata', async () => {
    const response = requirementImportHttpErrorResponse(
      importCapacityBusyError(),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('5')
    await expect(response.json()).resolves.toMatchObject({
      code: 'import_capacity_busy',
    })
  })

  it('accepts exact structural boundaries and applies semantic validation last', async () => {
    const schema = {
      safeParse: vi.fn(value => ({ data: value, success: true })),
    }
    const body = {
      payload: {
        requirements: [{ normReferenceIds: ['STD-1'] }],
      },
    }

    const result = await readRequirementImportRequest(request(body), {
      budget,
      content: value => (value as typeof body).payload,
      schema: schema as never,
    })

    expect(result).toMatchObject({ data: body, ok: true })
    expect(schema.safeParse).toHaveBeenCalledOnce()
  })

  it('accepts the exact 10 MiB transport boundary', async () => {
    const prefix = '{"payload":null}'
    const exactBody = `${prefix}${' '.repeat(
      REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES - prefix.length,
    )}`

    const result = await readRequirementImportRequest(
      new Request('https://example.test/api/requirements/import/preview', {
        body: exactBody,
        method: 'POST',
      }),
      {
        budget,
        content: body => (body as { payload: unknown }).payload,
        schema: z.unknown(),
      },
    )

    expect(result.ok).toBe(true)
  })

  it('rejects a declared 10 MiB plus one-byte transport before parsing', async () => {
    const result = await readRequirementImportRequest(
      new Request('https://example.test/api/requirements/import/preview', {
        body: '{}',
        headers: {
          'Content-Length': String(REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES + 1),
        },
        method: 'POST',
      }),
      { budget, content: body => body, schema: z.unknown() },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(413)
      await expect(result.response.json()).resolves.toMatchObject({
        code: 'import_transport_bytes_exceeded',
      })
    }
  })

  it('returns the standard invalid JSON response for malformed input', async () => {
    const result = await readRequirementImportRequest(
      new Request('https://example.test/api/requirements/import/preview', {
        body: '{',
        method: 'POST',
      }),
      { budget, content: body => body, schema: z.unknown() },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      await expect(result.response.json()).resolves.toMatchObject({
        issues: [expect.objectContaining({ code: 'invalid_json' })],
      })
    }
  })

  it('accepts a route extractor with no canonical content', async () => {
    const result = await readRequirementImportRequest(request({}), {
      budget,
      content: () => undefined,
      schema: z.unknown(),
    })

    expect(result.ok).toBe(true)
  })

  it('accepts exact 8 MiB UTF-8 content and rejects one byte over', async () => {
    const exactContent = 'a'.repeat(REQUIREMENT_IMPORT_CONTENT_MAX_BYTES - 2)
    const exact = await readRequirementImportRequest(
      request({ payload: exactContent }),
      {
        budget,
        content: body => (body as { payload: unknown }).payload,
        schema: z.unknown(),
      },
    )
    expect(exact.ok).toBe(true)

    const over = await readRequirementImportRequest(
      request({ payload: `${exactContent}a` }),
      {
        budget,
        content: body => (body as { payload: unknown }).payload,
        schema: z.unknown(),
      },
    )
    expect(over.ok).toBe(false)
    if (!over.ok) {
      expect(over.response.status).toBe(413)
      await expect(over.response.json()).resolves.toMatchObject({
        code: 'import_content_bytes_exceeded',
      })
    }
  })

  it.each([
    ['import_row_count_cap_exceeded', { requirements: [{}, {}] }],
    [
      'import_nested_collection_cap_exceeded',
      { requirements: [{ normReferenceIds: ['A', 'B'] }] },
    ],
    [
      'import_json_depth_cap_exceeded',
      { requirements: [{ nested: { child: {} } }] },
    ],
    [
      'import_proposed_norm_reference_count_cap_exceeded',
      { proposedNormReferences: [{}, {}], requirements: [{}] },
    ],
    [
      'import_proposed_needs_reference_count_cap_exceeded',
      { proposedNeedsReferences: [{}, {}], requirements: [{}] },
    ],
  ])(
    'returns stable 422 %s before semantic validation',
    async (code, payload) => {
      const schema = z.unknown()
      const safeParse = vi.spyOn(schema, 'safeParse')

      const result = await readRequirementImportRequest(request({ payload }), {
        budget,
        content: value => (value as { payload: unknown }).payload,
        schema,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.response.status).toBe(422)
        await expect(result.response.json()).resolves.toMatchObject({ code })
      }
      expect(safeParse).not.toHaveBeenCalled()
    },
  )
})
