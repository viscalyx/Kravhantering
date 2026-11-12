import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { AppLocale } from '@/lib/locale-preference'
import { DEFAULT_REQUIREMENT_IMPORT_BUDGET } from '@/lib/requirements/import-budget'
import {
  describeRequirementImportJsonProblem,
  formatRequirementImportJsonErrors,
  formatRequirementImportJsonPath,
  isRequirementImportJsonProblemRepairable,
  REQUIREMENT_IMPORT_JSON_DIALOG_ERROR_LIMIT,
} from '@/lib/requirements/import-json-errors'
import {
  type ImportJsonProblem,
  readRequirementImportJson,
} from '@/lib/requirements/import-json-input'
import {
  buildRequirementsImportPayloadSchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

const NAMESPACE = 'requirementsImportJson'

function translatorFor(locale: AppLocale) {
  const translate = createTranslator({
    locale,
    messages: locale === 'sv' ? svMessages : enMessages,
    namespace: NAMESPACE,
  })
  return (key: string, values?: Record<string, number | string>) =>
    translate(key as never, values as never)
}

const schema = buildRequirementsImportPayloadSchema(
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
)

function problemFor(value: unknown): ImportJsonProblem {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const { problem } = readRequirementImportJson(text, schema)
  if (!problem) throw new Error('Expected an import JSON problem')
  return problem
}

describe('formatRequirementImportJsonPath', () => {
  it('formats JSON paths from the document root', () => {
    expect(formatRequirementImportJsonPath([])).toBe('$')
    expect(
      formatRequirementImportJsonPath(['requirements', 3, 'description']),
    ).toBe('$.requirements[3].description')
    expect(formatRequirementImportJsonPath(['odd key'])).toBe('$["odd key"]')
  })
})

describe('describeRequirementImportJsonProblem', () => {
  it.each([
    [
      'sv',
      'Svaret innehåller ingen JSON. Läs AI-assistentens svar. Behovet eller referensdatafilen kan saknas.',
      'Svaret är troligen avkortat. Be om färre krav per förfrågan.',
      `schemaVersion ska vara ${REQUIREMENTS_IMPORT_SCHEMA_VERSION}.`,
    ],
    [
      'en',
      "The response contains no JSON. Read the AI assistant's response. The need or the reference data file may be missing.",
      'The response is probably truncated. Ask for fewer requirements per request.',
      `schemaVersion must be ${REQUIREMENTS_IMPORT_SCHEMA_VERSION}.`,
    ],
  ] as const)(
    'describes each classification in %s',
    (locale, noJson, truncated, wrongVersion) => {
      const t = translatorFor(locale)

      expect(describeRequirementImportJsonProblem({ kind: 'no-json' }, t)).toBe(
        noJson,
      )
      expect(
        describeRequirementImportJsonProblem({ kind: 'truncated' }, t),
      ).toBe(truncated)
      expect(
        describeRequirementImportJsonProblem(
          {
            expectedVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
            kind: 'wrong-version',
          },
          t,
        ),
      ).toBe(wrongVersion)
      expect(
        describeRequirementImportJsonProblem(
          { codeBlockCount: 3, kind: 'multiple-code-blocks' },
          t,
        ),
      ).toContain('3')
    },
  )

  it('includes line and column in syntax errors when they are known', () => {
    const sv = translatorFor('sv')
    const en = translatorFor('en')
    const problem = problemFor('{\n  "a": x\n}')

    expect(describeRequirementImportJsonProblem(problem, sv)).toBe(
      'JSON har ett syntaxfel på rad 2, kolumn 8: oväntat tecken ”x”.',
    )
    expect(describeRequirementImportJsonProblem(problem, en)).toBe(
      'The JSON has a syntax error at line 2, column 8: unexpected character “x”.',
    )
    expect(
      describeRequirementImportJsonProblem(
        {
          character: null,
          kind: 'syntax',
          location: null,
          reason: 'unexpected-end',
        },
        en,
      ),
    ).toBe('The JSON has a syntax error: unexpected end of the JSON text.')
  })

  it('summarizes schema errors with their count', () => {
    const problem = problemFor({
      requirements: [{}, {}],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    expect(
      describeRequirementImportJsonProblem(problem, translatorFor('sv')),
    ).toBe('JSON följer inte importschemat. Rätta 2 fel:')
    expect(
      describeRequirementImportJsonProblem(problem, translatorFor('en')),
    ).toBe('The JSON does not match the import schema. Fix 2 errors:')
  })
})

describe('formatRequirementImportJsonErrors', () => {
  it('gives each schema error a JSON path and a translated text per Zod issue code', () => {
    const problem = problemFor({
      extra: 1,
      requirements: [
        { categoryId: 0, typeId: 1.5 },
        { description: '   ', normReferenceIds: 'ISO', verifiable: 'ja' },
      ],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    const formatted = formatRequirementImportJsonErrors(problem, {
      limit: REQUIREMENT_IMPORT_JSON_DIALOG_ERROR_LIMIT,
      t: translatorFor('sv'),
    })

    expect(formatted.omittedCount).toBe(0)
    expect(formatted.errors).toEqual(
      expect.arrayContaining([
        {
          message: 'Fältet saknas men är obligatoriskt.',
          path: '$.requirements[0].description',
        },
        {
          message: 'Förväntade heltal men fick tal.',
          path: '$.requirements[0].typeId',
        },
        {
          message: 'Måste vara minst 1.',
          path: '$.requirements[0].categoryId',
        },
        {
          message: 'Får inte vara tom.',
          path: '$.requirements[1].description',
        },
        {
          message: 'Förväntade lista men fick text.',
          path: '$.requirements[1].normReferenceIds',
        },
        {
          message: 'Förväntade sant eller falskt men fick text.',
          path: '$.requirements[1].verifiable',
        },
        { message: 'Okänt fält. Ta bort det.', path: '$.extra' },
      ]),
    )
    expect(formatted.errors).toHaveLength(7)
  })

  it('translates the same errors in English', () => {
    const problem = problemFor({
      requirements: [],
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    expect(
      formatRequirementImportJsonErrors(problem, {
        limit: 20,
        t: translatorFor('en'),
      }).errors,
    ).toEqual([
      { message: 'Must contain at least 1 item.', path: '$.requirements' },
    ])
  })

  it('caps the list and reports how many errors were left out', () => {
    const problem = problemFor({
      requirements: Array.from({ length: 23 }, () => ({})),
      schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    })

    const dialog = formatRequirementImportJsonErrors(problem, {
      limit: REQUIREMENT_IMPORT_JSON_DIALOG_ERROR_LIMIT,
      t: translatorFor('sv'),
    })
    const repair = formatRequirementImportJsonErrors(problem, {
      limit: 50,
      t: translatorFor('sv'),
    })

    expect(REQUIREMENT_IMPORT_JSON_DIALOG_ERROR_LIMIT).toBe(20)
    expect(dialog.errors).toHaveLength(20)
    expect(dialog.omittedCount).toBe(3)
    expect(dialog.errors[19]?.path).toBe('$.requirements[19].description')
    expect(repair.errors).toHaveLength(23)
    expect(repair.omittedCount).toBe(0)
    expect(translatorFor('sv')('moreErrors', { count: 3 })).toBe(
      'och 3 fel till',
    )
    expect(translatorFor('en')('moreErrors', { count: 3 })).toBe(
      'and 3 more errors',
    )
  })

  it('formats syntax and schemaVersion problems as single errors for reuse', () => {
    const t = translatorFor('en')

    expect(
      formatRequirementImportJsonErrors(problemFor('{"a": [1,]}'), {
        limit: 50,
        t,
      }).errors,
    ).toEqual([
      {
        message:
          'The JSON has a syntax error at line 1, column 10: unexpected character “]”.',
        path: '$',
      },
    ])
    expect(
      formatRequirementImportJsonErrors(
        {
          expectedVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
          kind: 'wrong-version',
        },
        { limit: 50, t },
      ).errors,
    ).toEqual([
      {
        message: `schemaVersion must be ${REQUIREMENTS_IMPORT_SCHEMA_VERSION}.`,
        path: '$.schemaVersion',
      },
    ])
    expect(
      formatRequirementImportJsonErrors({ kind: 'no-json' }, { limit: 50, t }),
    ).toEqual({ errors: [], omittedCount: 0 })
  })
})

describe('schema issue texts', () => {
  const t = translatorFor('en')

  function messagesFor(
    issues: Extract<ImportJsonProblem, { kind: 'schema' }>['issues'],
  ) {
    return formatRequirementImportJsonErrors(
      { issues, kind: 'schema' },
      { limit: 50, t },
    ).errors.map(error => error.message)
  }

  it('translates size limits for text, lists and numbers', () => {
    expect(
      messagesFor([
        {
          code: 'too_small',
          message: '',
          minimum: 3,
          origin: 'string',
          path: ['a'],
        },
        {
          code: 'too_big',
          maximum: 1,
          message: '',
          origin: 'string',
          path: ['a'],
        },
        {
          code: 'too_big',
          maximum: 2,
          message: '',
          origin: 'array',
          path: ['a'],
        },
        {
          code: 'too_small',
          inclusive: false,
          message: '',
          minimum: 0,
          origin: 'number',
          path: ['a'],
        },
        {
          code: 'too_big',
          maximum: 9,
          message: '',
          origin: 'int',
          path: ['a'],
        },
        {
          code: 'too_big',
          inclusive: false,
          maximum: 9,
          message: '',
          origin: 'number',
          path: ['a'],
        },
        {
          code: 'too_big',
          maximum: 9,
          message: '',
          origin: 'date',
          path: ['a'],
        },
      ]),
    ).toEqual([
      'Must have at least 3 characters.',
      'Must have at most 1 character.',
      'Must contain at most 2 items.',
      'Must be greater than 0.',
      'Must be at most 9.',
      'Must be less than 9.',
      'Invalid value.',
    ])
  })

  it('translates value, format, custom and other issue codes', () => {
    expect(
      messagesFor([
        { code: 'invalid_value', message: '', path: ['a'], values: ['x', 2] },
        { code: 'invalid_format', message: '', path: ['a'] },
        {
          code: 'custom',
          message: 'import_json_depth_cap_exceeded',
          path: [],
        },
        {
          code: 'custom',
          message: 'Expected unique proposed norm reference keys',
          path: ['proposedNormReferences', 1, 'key'],
        },
        { code: 'custom', message: 'Something else', path: ['a'] },
        { code: 'invalid_union', message: '', path: ['a'] },
        {
          code: 'invalid_type',
          expected: 'bigint',
          message: '',
          path: ['a'],
          received: 'unknown',
        },
        { code: 'unrecognized_keys', message: '', path: ['a'] },
      ]),
    ).toEqual([
      'Must be "x", 2.',
      'The value has the wrong format.',
      'The JSON is nested too deeply.',
      'The key must be unique.',
      'Invalid value.',
      'Invalid value.',
      'Expected another value but got another value.',
      'Invalid value.',
    ])
  })

  it('describes string and unknown syntax errors', () => {
    expect(
      describeRequirementImportJsonProblem(problemFor('{"a": "\\x"}'), t),
    ).toBe(
      'The JSON has a syntax error at line 1, column 9: invalid character or escape sequence in a string.',
    )
    expect(
      describeRequirementImportJsonProblem(
        { character: null, kind: 'syntax', location: null, reason: null },
        t,
      ),
    ).toBe('The JSON has a syntax error: the text cannot be read as JSON.')
    expect(
      describeRequirementImportJsonProblem(
        {
          character: null,
          kind: 'syntax',
          location: { column: 1, line: 1 },
          reason: 'unexpected-character',
        },
        t,
      ),
    ).toBe(
      'The JSON has a syntax error at line 1, column 1: the text cannot be read as JSON.',
    )
  })
})

describe('isRequirementImportJsonProblemRepairable', () => {
  it.each([
    [
      'a syntax error',
      `{\n  "schemaVersion": "${REQUIREMENTS_IMPORT_SCHEMA_VERSION}",,\n}`,
    ],
    ['a wrong schemaVersion', { requirements: [{}], schemaVersion: 'v1' }],
    [
      'schema errors',
      { requirements: [], schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION },
    ],
  ])('offers a repair prompt for %s', (_label, value) => {
    expect(isRequirementImportJsonProblemRepairable(problemFor(value))).toBe(
      true,
    )
  })

  it.each([
    ['a response without JSON', 'I need the reference data file first.'],
    ['truncated JSON', '{"requirements": ['],
    ['several code blocks', '```json\n{"a": 1}\n```\n```json\n{"b": 2}\n```'],
  ])('gives %s a hint instead of a repair prompt', (_label, value) => {
    expect(isRequirementImportJsonProblemRepairable(problemFor(value))).toBe(
      false,
    )
  })
})
