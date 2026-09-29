import { describe, expect, it } from 'vitest'
import { DEFAULT_REQUIREMENT_IMPORT_BUDGET } from '@/lib/requirements/import-budget'
import {
  isTruncatedJsonText,
  readRequirementImportJson,
} from '@/lib/requirements/import-json-input'
import {
  buildRequirementsImportPayloadSchema,
  REQUIREMENTS_IMPORT_SCHEMA_VERSION,
} from '@/lib/requirements/import-schema'

const schema = buildRequirementsImportPayloadSchema(
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
)

const validJson = JSON.stringify(
  {
    requirements: [{ description: 'Systemet ska logga inloggningar.' }],
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  },
  null,
  2,
)

function read(text: string) {
  return readRequirementImportJson(text, schema)
}

describe('readRequirementImportJson', () => {
  it('returns the schema-validated payload for plain JSON', () => {
    const result = read(`\n  ${validJson}\n`)

    expect(result.problem).toBeNull()
    expect(result.extractedFromCodeBlock).toBe(false)
    expect(result.payload?.requirements[0]?.description).toBe(
      'Systemet ska logga inloggningar.',
    )
  })

  it('extracts JSON from exactly one fenced code block with a json info string', () => {
    const result = read(
      `Här är kraven:\n\n\`\`\`json\n${validJson}\n\`\`\`\n\nSäg till om du vill ha fler.`,
    )

    expect(result.problem).toBeNull()
    expect(result.extractedFromCodeBlock).toBe(true)
    expect(result.payload?.schemaVersion).toBe(
      REQUIREMENTS_IMPORT_SCHEMA_VERSION,
    )
  })

  it('extracts JSON from exactly one fenced code block without an info string', () => {
    const result = read(`\`\`\`\n${validJson}\n\`\`\``)

    expect(result.problem).toBeNull()
    expect(result.extractedFromCodeBlock).toBe(true)
  })

  it('rejects several code blocks without extracting any of them', () => {
    const result = read(
      `Förslag 1:\n\`\`\`json\n${validJson}\n\`\`\`\nFörslag 2:\n\`\`\`json\n${validJson}\n\`\`\``,
    )

    expect(result.payload).toBeNull()
    expect(result.extractedFromCodeBlock).toBe(false)
    expect(result.problem).toEqual({
      codeBlockCount: 2,
      kind: 'multiple-code-blocks',
    })
  })

  it('classifies a response without a leading brace or code block as no JSON', () => {
    expect(
      read(
        'Jag behöver en beskrivning av behovet och referensdatafilen innan jag kan svara.',
      ).problem,
    ).toEqual({ kind: 'no-json' })
    expect(read('   ').problem).toEqual({ kind: 'no-json' })
  })

  it('classifies JSON that ends inside an open object, list or string as truncated', () => {
    const cutInArray = validJson.slice(0, validJson.indexOf('}') + 1)
    const cutInString = validJson.slice(0, validJson.indexOf('logga') + 2)

    expect(read('{"requirements": [').problem).toEqual({ kind: 'truncated' })
    expect(read(cutInArray).problem).toEqual({ kind: 'truncated' })
    expect(read(cutInString).problem).toEqual({ kind: 'truncated' })
  })

  it('classifies a truncated JSON response inside an unclosed code block as truncated', () => {
    const result = read(`\`\`\`json\n${validJson.slice(0, 40)}`)

    expect(result.problem).toEqual({ kind: 'truncated' })
    expect(result.extractedFromCodeBlock).toBe(true)
  })

  it('reports a syntax error with line and column in the field text', () => {
    const result = read(
      '{\n  "schemaVersion": "x",\n  "requirements": [1,],\n}',
    )

    expect(result.problem).toEqual({
      character: ']',
      kind: 'syntax',
      location: { column: 22, line: 3 },
      reason: 'unexpected-character',
    })
  })

  it('reports syntax error locations relative to the field text when a code block is extracted', () => {
    const result = read('Svar:\n```json\n{\n  "a": x\n}\n```')

    expect(result.extractedFromCodeBlock).toBe(true)
    expect(result.problem).toEqual({
      character: 'x',
      kind: 'syntax',
      location: { column: 8, line: 4 },
      reason: 'unexpected-character',
    })
  })

  it('reports invalid string content and trailing content as syntax errors', () => {
    expect(read('{"a": "tab\there"}').problem).toMatchObject({
      kind: 'syntax',
      location: { column: 11, line: 1 },
      reason: 'invalid-string',
    })
    expect(read('{"a": "bad \\q escape"}').problem).toMatchObject({
      kind: 'syntax',
      reason: 'invalid-string',
    })
    expect(read('{"a": 1} trailing').problem).toMatchObject({
      character: 't',
      kind: 'syntax',
      location: { column: 10, line: 1 },
    })
    expect(read('{"a": 1}}').problem).toMatchObject({
      character: '}',
      kind: 'syntax',
    })
  })

  it('classifies a wrong or missing schemaVersion before schema validation', () => {
    expect(
      read(
        JSON.stringify({
          requirements: [],
          schemaVersion: 'requirement-import.v1',
        }),
      ).problem,
    ).toEqual({
      expectedVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      kind: 'wrong-version',
    })
    expect(read(JSON.stringify({ requirements: [] })).problem).toEqual({
      expectedVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      kind: 'wrong-version',
    })
  })

  it('returns schema issues with paths and the received value type', () => {
    const result = read(
      JSON.stringify({
        extra: true,
        requirements: [{ typeId: 1.5 }, { description: '', verifiable: 'ja' }],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      }),
    )

    expect(result.problem?.kind).toBe('schema')
    if (result.problem?.kind !== 'schema') throw new Error('Expected schema')
    expect(result.problem.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_type',
          expected: 'string',
          path: ['requirements', 0, 'description'],
          received: 'missing',
        }),
        expect.objectContaining({
          code: 'invalid_type',
          expected: 'int',
          path: ['requirements', 0, 'typeId'],
          received: 'number',
        }),
        expect.objectContaining({
          code: 'too_small',
          minimum: 1,
          origin: 'string',
          path: ['requirements', 1, 'description'],
        }),
        expect.objectContaining({
          code: 'invalid_type',
          expected: 'boolean',
          path: ['requirements', 1, 'verifiable'],
          received: 'string',
        }),
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: ['extra'],
          path: [],
        }),
      ]),
    )
  })

  it.each([
    ['an array', '[1, 2]'],
    ['a string', '"Jag behöver referensdatafilen"'],
    ['a number', '8'],
  ])(
    'reports no JSON when the whole text is %s instead of an object',
    (_label, text) => {
      const result = read(text)

      expect(result).toEqual({
        extractedFromCodeBlock: false,
        payload: null,
        problem: { kind: 'no-json' },
      })
    },
  )

  it('returns a schema issue for a code block whose JSON value is not an object', () => {
    const result = read('```json\n[1, 2]\n```')

    expect(result.extractedFromCodeBlock).toBe(true)
    expect(result.problem).toEqual({
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          expected: 'object',
          path: [],
          received: 'array',
        }),
      ],
      kind: 'schema',
    })
  })
})

describe('isTruncatedJsonText', () => {
  it('follows strings, escapes and brackets instead of engine error text', () => {
    expect(isTruncatedJsonText('{"a": "}"')).toBe(true)
    expect(isTruncatedJsonText('{"a": "\\"}')).toBe(true)
    expect(isTruncatedJsonText('{"a": ["]"')).toBe(true)
    expect(isTruncatedJsonText('{"a": [1, 2]')).toBe(true)
    expect(isTruncatedJsonText('{"a": [1, 2]}')).toBe(false)
    expect(isTruncatedJsonText('{"a": [1, 2}')).toBe(false)
    expect(isTruncatedJsonText('{"a": 1}}')).toBe(false)
    expect(isTruncatedJsonText('"text')).toBe(false)
  })
})

describe('readRequirementImportJson syntax scanning', () => {
  function syntaxProblem(text: string) {
    const { problem } = read(text)
    if (problem?.kind !== 'syntax') {
      throw new Error(`Expected a syntax problem, got ${problem?.kind}`)
    }
    return problem
  }

  it('accepts valid JSON grammar before the first error', () => {
    expect(
      syntaxProblem(
        '{"a": {}, "b": [], "c": [true, false, null, -0.5e+3, 10, "\\u00e5\\n"], "d": x}',
      ),
    ).toMatchObject({ character: 'x', location: { column: 76, line: 1 } })
  })

  it('locates errors in numbers, literals, keys and unicode escapes', () => {
    expect(syntaxProblem('{"a": -}')).toMatchObject({ character: '}' })
    expect(syntaxProblem('{"a": 1.}')).toMatchObject({ character: '}' })
    expect(syntaxProblem('{"a": 1e}')).toMatchObject({ character: '}' })
    expect(syntaxProblem('{"a": nul}')).toMatchObject({ character: '}' })
    expect(syntaxProblem('{a: 1}')).toMatchObject({ character: 'a' })
    expect(syntaxProblem('{"a" 1}')).toMatchObject({ character: '1' })
    expect(syntaxProblem('{"a": [1 2]}')).toMatchObject({ character: '2' })
    expect(syntaxProblem('{"a": "\\u12G4"}')).toMatchObject({
      location: { column: 12, line: 1 },
      reason: 'invalid-string',
    })
  })

  it('reads code blocks with tilde fences and skips fences with backticks in the info string', () => {
    expect(read(`~~~json\n${validJson}\n~~~`).problem).toBeNull()
    expect(read('```js `x`\n{}\n```').problem).toEqual({ kind: 'no-json' })
    expect(read('Jag behöver behovet.\n```\nexempel\n```')).toEqual({
      extractedFromCodeBlock: false,
      payload: null,
      problem: { kind: 'no-json' },
    })
  })
})
