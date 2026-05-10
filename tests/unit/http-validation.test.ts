import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  BUSINESS_TEXT_MAX_LENGTH,
  idParamSchema,
  optionalQueryArraySchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

describe('http validation helpers', () => {
  it('returns a typed invalid request response for malformed JSON', async () => {
    const result = await readJsonWithSchema(
      new Request('http://localhost/api/test', {
        body: '{',
        method: 'POST',
      }),
      z.object({ name: z.string() }).strict(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.response.status).toBe(400)
    expect(await result.response.json()).toEqual({
      error: 'Invalid request',
      issues: [
        {
          code: 'invalid_json',
          message: 'Malformed JSON body',
          path: '$',
        },
      ],
    })
  })

  it('rejects unknown fields with sanitized issue details', async () => {
    const result = await readJsonWithSchema(
      new Request('http://localhost/api/test', {
        body: JSON.stringify({ name: 'Ada', role: 'admin' }),
        method: 'POST',
      }),
      z.object({ name: z.string() }).strict(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(await result.response.json()).toMatchObject({
      error: 'Invalid request',
      issues: [
        {
          code: 'unrecognized_keys',
          path: '$',
        },
      ],
    })
  })

  it('parses positive integer route params and rejects invalid IDs', async () => {
    await expect(
      parseRouteParams(Promise.resolve({ id: '42' }), idParamSchema),
    ).resolves.toMatchObject({ data: { id: 42 }, ok: true })

    const invalid = await parseRouteParams(
      Promise.resolve({ id: '-1' }),
      idParamSchema,
    )

    expect(invalid.ok).toBe(false)
  })

  it('rejects malformed query arrays instead of dropping bad values', () => {
    const schema = z
      .object({
        statuses: optionalQueryArraySchema(positiveIntegerStringSchema),
      })
      .strict()

    const result = parseSearchParams(
      new URLSearchParams('statuses=1&statuses=abc'),
      schema,
    )

    expect(result.ok).toBe(false)
  })

  it('rejects invalid query booleans', () => {
    const schema = z.object({ refresh: queryBooleanSchema.optional() }).strict()
    const result = parseSearchParams(new URLSearchParams('refresh=yes'), schema)

    expect(result.ok).toBe(false)
  })

  it('rejects oversized business text', async () => {
    const schema = z
      .object({
        description: z.string().max(BUSINESS_TEXT_MAX_LENGTH),
      })
      .strict()
    const result = await readJsonWithSchema(
      new Request('http://localhost/api/test', {
        body: JSON.stringify({
          description: 'x'.repeat(BUSINESS_TEXT_MAX_LENGTH + 1),
        }),
        method: 'POST',
      }),
      schema,
    )

    expect(result.ok).toBe(false)
  })
})
