import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { importCapacityBusyError } from '@/lib/requirements/errors'
import type { RequirementImportBudget } from '@/lib/requirements/import-budget'
import {
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
  REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES,
} from '@/lib/requirements/import-budget'
import {
  readRequirementImportRequest,
  requirementImportHttpErrorResponse,
} from '@/lib/requirements/import-http'

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
