import { NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ARRAY_INPUT_MAX_ITEMS,
  BUSINESS_TEXT_MAX_LENGTH,
  boundedDbStringSchema,
  businessTextSchema,
  DB_STRING_MAX_LENGTH,
  idParamSchema,
  localeSchema,
  nonNegativeIntegerSchema,
  nonNegativeIntegerStringSchema,
  nullableBoundedDbStringSchema,
  nullableBusinessTextSchema,
  optionalBoundedDbStringSchema,
  optionalBusinessTextSchema,
  optionalLocaleQuerySchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  optionalUniquePositiveIntegerArraySchema,
  parseRouteParams,
  parseSearchParams,
  parseWithSchema,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  queryArraySchema,
  queryBooleanSchema,
  queryBooleanStringSchema,
  readBoundedJsonWithSchema,
  readJsonWithSchema,
  refOrPositiveIntegerSegmentSchema,
  SQL_SERVER_INT_MAX,
  searchParamsToRecord,
  searchStringSchema,
  strictHexColorSchema,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'

describe('http validation helpers', () => {
  it('parses valid JSON through the supplied strict schema', async () => {
    const result = await readJsonWithSchema(
      new Request('http://localhost/api/test', {
        body: JSON.stringify({ name: 'Ada' }),
        method: 'POST',
      }),
      z.object({ name: z.string() }).strict(),
    )

    expect(result).toEqual({ data: { name: 'Ada' }, ok: true })
  })

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

  it('maps bounded JSON overflow before schema parsing', async () => {
    const result = await readBoundedJsonWithSchema(
      new Request('http://localhost/api/test', {
        body: JSON.stringify({ name: 'Ada' }),
        method: 'POST',
      }),
      z.object({ name: z.string() }).strict(),
      {
        maxBytes: 5,
        requestBytesExceededResponse: () =>
          NextResponse.json(
            { code: 'request_bytes_exceeded' },
            { status: 413 },
          ),
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(413)
    await expect(result.response.json()).resolves.toEqual({
      code: 'request_bytes_exceeded',
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

  it('enforces SQL Server integer boundaries for number and query schemas', () => {
    expect(positiveIntegerSchema.safeParse(1).success).toBe(true)
    expect(positiveIntegerSchema.safeParse(SQL_SERVER_INT_MAX).success).toBe(
      true,
    )
    expect(positiveIntegerSchema.safeParse(0).success).toBe(false)
    expect(positiveIntegerSchema.safeParse(1.5).success).toBe(false)
    expect(nonNegativeIntegerSchema.safeParse(0).success).toBe(true)
    expect(nonNegativeIntegerSchema.safeParse(-1).success).toBe(false)
    expect(positiveIntegerStringSchema.safeParse(' 42 ').data).toBe(42)
    expect(positiveIntegerStringSchema.safeParse('01').success).toBe(false)
    expect(
      positiveIntegerStringSchema.safeParse(String(SQL_SERVER_INT_MAX + 1))
        .success,
    ).toBe(false)
    expect(nonNegativeIntegerStringSchema.safeParse('0').data).toBe(0)
    expect(nonNegativeIntegerStringSchema.safeParse('-1').success).toBe(false)
  })

  it('distinguishes positive numeric route IDs from bounded references', () => {
    expect(refOrPositiveIntegerSegmentSchema.safeParse('42').data).toBe('42')
    expect(refOrPositiveIntegerSegmentSchema.safeParse('REQ-42').data).toBe(
      'REQ-42',
    )
    expect(refOrPositiveIntegerSegmentSchema.safeParse('0').success).toBe(false)
    expect(refOrPositiveIntegerSegmentSchema.safeParse('-1.5').success).toBe(
      false,
    )
    expect(
      refOrPositiveIntegerSegmentSchema.safeParse(
        String(SQL_SERVER_INT_MAX + 1),
      ).success,
    ).toBe(false)
  })

  it('trims and bounds database, business, search, locale, and color fields', () => {
    expect(boundedDbStringSchema.parse(' value ')).toBe('value')
    expect(boundedDbStringSchema.safeParse('').success).toBe(false)
    expect(
      boundedDbStringSchema.safeParse('x'.repeat(DB_STRING_MAX_LENGTH + 1))
        .success,
    ).toBe(false)
    expect(optionalBoundedDbStringSchema.parse(undefined)).toBeUndefined()
    expect(nullableBoundedDbStringSchema.parse(null)).toBeNull()
    expect(businessTextSchema.parse(' description ')).toBe('description')
    expect(optionalBusinessTextSchema.parse(undefined)).toBeUndefined()
    expect(nullableBusinessTextSchema.parse(null)).toBeNull()
    expect(searchStringSchema.parse(' search ')).toBe('search')
    expect(optionalSearchStringSchema.parse('   ')).toBeUndefined()
    expect(optionalSearchStringSchema.parse(' query ')).toBe('query')
    expect(localeSchema.safeParse('sv').success).toBe(true)
    expect(localeSchema.safeParse('de').success).toBe(false)
    expect(optionalLocaleQuerySchema.parse(undefined)).toBe('en')
    expect(queryBooleanSchema.parse('true')).toBe(true)
    expect(queryBooleanSchema.parse('false')).toBe(false)
    expect(queryBooleanStringSchema.safeParse('1').success).toBe(false)
    expect(strictHexColorSchema.safeParse('#00aAFF').success).toBe(true)
    expect(strictHexColorSchema.safeParse('00aAFF').success).toBe(false)
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

  it('preserves single and repeated search parameters for schema parsing', () => {
    expect(
      searchParamsToRecord(new URLSearchParams('q=one&q=two&page=3')),
    ).toEqual({ page: '3', q: ['one', 'two'] })
    expect(
      parseSearchParams(
        new URLSearchParams('q=one&q=two'),
        z.object({ q: z.array(z.string()) }),
      ),
    ).toEqual({ data: { q: ['one', 'two'] }, ok: true })
  })

  it('normalizes required and optional query arrays', () => {
    const required = queryArraySchema(positiveIntegerStringSchema)
    const optional = optionalQueryArraySchema(positiveIntegerStringSchema)

    expect(required.parse(undefined)).toEqual([])
    expect(required.parse('7')).toEqual([7])
    expect(required.parse(['7', '8'])).toEqual([7, 8])
    expect(optional.parse(undefined)).toBeUndefined()
    expect(optional.parse('7')).toEqual([7])
    expect(
      required.safeParse(Array(ARRAY_INPUT_MAX_ITEMS + 1).fill('1')).success,
    ).toBe(false)
  })

  it('enforces uniqueness for reusable positive-integer arrays', () => {
    expect(uniquePositiveIntegerArraySchema().parse([1, 2])).toEqual([1, 2])
    expect(uniquePositiveIntegerArraySchema().safeParse([1, 1]).success).toBe(
      false,
    )
    expect(optionalUniquePositiveIntegerArraySchema().parse(undefined)).toBe(
      undefined,
    )
    expect(
      optionalUniquePositiveIntegerArraySchema().safeParse([0]).success,
    ).toBe(false)
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

  it('formats nested validation issue paths for API clients', async () => {
    const result = parseWithSchema(
      z.object({ items: z.array(z.object({ id: z.number().positive() })) }),
      { items: [{ id: -1 }] },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    await expect(result.response.json()).resolves.toMatchObject({
      issues: [{ path: 'items.0.id' }],
    })
  })
})
