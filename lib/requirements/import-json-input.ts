import type { z } from 'zod'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'

/**
 * Reads import JSON pasted or dropped into the import dialog, for example a
 * response from an external AI assistant. The module is pure and safe to
 * import in client components, so the dialog's live validation and its review
 * loading share one reading and classification path.
 */

export type ImportJsonValueType =
  | 'array'
  | 'boolean'
  | 'null'
  | 'number'
  | 'object'
  | 'string'
  | 'unknown'

export interface ImportJsonTextLocation {
  /** 1-based column in the text the user entered. */
  column: number
  /** 1-based line in the text the user entered. */
  line: number
}

export type ImportJsonSyntaxErrorReason =
  | 'invalid-string'
  | 'unexpected-character'
  | 'unexpected-end'

export interface ImportJsonSchemaIssue {
  code: string
  expected?: string
  inclusive?: boolean
  keys?: readonly string[]
  maximum?: number
  message: string
  minimum?: number
  origin?: string
  path: readonly (number | string)[]
  /** The JSON type found at `path`, or `missing` when the field is absent. */
  received?: 'missing' | ImportJsonValueType
  values?: readonly unknown[]
}

export type ImportJsonProblem =
  | { kind: 'no-json' }
  | { codeBlockCount: number; kind: 'multiple-code-blocks' }
  | { kind: 'truncated' }
  | {
      character: string | null
      kind: 'syntax'
      location: ImportJsonTextLocation | null
      reason: ImportJsonSyntaxErrorReason | null
    }
  | { expectedVersion: string; kind: 'wrong-version' }
  | { issues: ImportJsonSchemaIssue[]; kind: 'schema' }

export type ImportJsonReadResult<T> =
  | {
      /** True when the JSON was taken from the only code block in the text. */
      extractedFromCodeBlock: boolean
      payload: T
      problem: null
    }
  | {
      extractedFromCodeBlock: boolean
      payload: null
      problem: ImportJsonProblem
    }

interface JsonSource {
  /** Offset of `text` within the text the user entered. */
  offset: number
  text: string
}

interface CodeBlock {
  content: string
  contentOffset: number
}

const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/u
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u

function splitLines(text: string): Array<{ line: string; start: number }> {
  const lines: Array<{ line: string; start: number }> = []
  let start = 0
  while (start <= text.length) {
    const newline = text.indexOf('\n', start)
    const end = newline === -1 ? text.length : newline
    lines.push({ line: text.slice(start, end).replace(/\r$/u, ''), start })
    if (newline === -1) break
    start = newline + 1
  }
  return lines
}

/**
 * Finds fenced Markdown code blocks. An unclosed fence runs to the end of the
 * text, which is how a truncated AI response inside a code block looks.
 */
function findCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  let open: { fence: string; contentOffset: number } | null = null
  for (const { line, start } of splitLines(text)) {
    if (!open) {
      const match = OPENING_FENCE.exec(line)
      const fence = match?.[1]
      if (!fence) continue
      if (fence.startsWith('`') && match[2]?.includes('`')) continue
      const lineEnd = text.indexOf('\n', start)
      open = {
        contentOffset: lineEnd === -1 ? text.length : lineEnd + 1,
        fence,
      }
      continue
    }
    const closing = CLOSING_FENCE.exec(line)?.[1]
    if (
      closing &&
      closing[0] === open.fence[0] &&
      closing.length >= open.fence.length
    ) {
      blocks.push({
        content: text.slice(open.contentOffset, start),
        contentOffset: open.contentOffset,
      })
      open = null
    }
  }
  if (open) {
    blocks.push({
      content: text.slice(open.contentOffset),
      contentOffset: open.contentOffset,
    })
  }
  return blocks
}

/**
 * Reports whether JSON text that starts with `{` ends inside an open string,
 * object or array. The scanner follows strings, escapes and brackets and does
 * not depend on the JavaScript engine's error text.
 */
export function isTruncatedJsonText(text: string): boolean {
  const source = text.trim()
  if (!source.startsWith('{')) return false
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const character of source) {
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
    } else if (character === '{' || character === '[') {
      stack.push(character === '{' ? '}' : ']')
    } else if (character === '}' || character === ']') {
      if (stack.pop() !== character) return false
      if (stack.length === 0) return false
    }
  }
  return inString || stack.length > 0
}

interface JsonSyntaxError {
  index: number
  reason: ImportJsonSyntaxErrorReason
}

const JSON_WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const JSON_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't'])
const HEX_DIGIT = /^[0-9a-fA-F]$/u
const DIGIT = /^[0-9]$/u

/**
 * Finds the first JSON syntax error in `source` with an iterative scanner, so
 * the location does not depend on engine-specific `JSON.parse` messages.
 * Returns `null` when the scanner finds no error.
 */
function findJsonSyntaxError(source: string): JsonSyntaxError | null {
  const length = source.length
  const closers: string[] = []
  let index = 0

  const skipWhitespace = () => {
    while (index < length && JSON_WHITESPACE.has(source[index] ?? '')) {
      index += 1
    }
  }
  const unexpected = (): JsonSyntaxError =>
    index >= length
      ? { index: length, reason: 'unexpected-end' }
      : { index, reason: 'unexpected-character' }

  const scanString = (): JsonSyntaxError | null => {
    index += 1
    while (index < length) {
      const character = source[index] ?? ''
      if (character === '"') {
        index += 1
        return null
      }
      if (character === '\\') {
        const escapeCharacter = source[index + 1]
        if (escapeCharacter === undefined) {
          index = length
          return unexpected()
        }
        if (escapeCharacter === 'u') {
          for (let offset = 2; offset < 6; offset += 1) {
            const hex = source[index + offset]
            if (hex === undefined) {
              index = length
              return unexpected()
            }
            if (!HEX_DIGIT.test(hex)) {
              return { index: index + offset, reason: 'invalid-string' }
            }
          }
          index += 6
          continue
        }
        if (!JSON_ESCAPES.has(escapeCharacter)) {
          return { index: index + 1, reason: 'invalid-string' }
        }
        index += 2
        continue
      }
      if (character.charCodeAt(0) < 0x20) {
        return { index, reason: 'invalid-string' }
      }
      index += 1
    }
    return unexpected()
  }

  const scanDigits = (): boolean => {
    const start = index
    while (index < length && DIGIT.test(source[index] ?? '')) index += 1
    return index > start
  }

  const scanNumber = (): JsonSyntaxError | null => {
    if (source[index] === '-') index += 1
    if (source[index] === '0') index += 1
    else if (!scanDigits()) return unexpected()
    if (source[index] === '.') {
      index += 1
      if (!scanDigits()) return unexpected()
    }
    if (source[index] === 'e' || source[index] === 'E') {
      index += 1
      if (source[index] === '+' || source[index] === '-') index += 1
      if (!scanDigits()) return unexpected()
    }
    return null
  }

  const scanLiteral = (literal: string): JsonSyntaxError | null => {
    for (const expected of literal) {
      if (source[index] !== expected) return unexpected()
      index += 1
    }
    return null
  }

  type State = 'afterValue' | 'key' | 'value'
  let state: State = 'value'
  skipWhitespace()
  while (true) {
    if (state === 'value') {
      skipWhitespace()
      const character = source[index]
      let error: JsonSyntaxError | null = null
      if (character === '{') {
        index += 1
        skipWhitespace()
        if (source[index] === '}') {
          index += 1
          state = 'afterValue'
        } else {
          closers.push('}')
          state = 'key'
        }
        continue
      }
      if (character === '[') {
        index += 1
        skipWhitespace()
        if (source[index] === ']') {
          index += 1
          state = 'afterValue'
        } else {
          closers.push(']')
          state = 'value'
        }
        continue
      }
      if (character === '"') error = scanString()
      else if (character === '-' || DIGIT.test(character ?? ''))
        error = scanNumber()
      else if (character === 't') error = scanLiteral('true')
      else if (character === 'f') error = scanLiteral('false')
      else if (character === 'n') error = scanLiteral('null')
      else error = unexpected()
      if (error) return error
      state = 'afterValue'
      continue
    }
    if (state === 'key') {
      skipWhitespace()
      if (source[index] !== '"') return unexpected()
      const error = scanString()
      if (error) return error
      skipWhitespace()
      if (source[index] !== ':') return unexpected()
      index += 1
      state = 'value'
      continue
    }
    skipWhitespace()
    const closer = closers.at(-1)
    if (closer === undefined) {
      return index < length ? unexpected() : null
    }
    const character = source[index]
    if (character === ',') {
      index += 1
      state = closer === '}' ? 'key' : 'value'
      continue
    }
    if (character === closer) {
      index += 1
      closers.pop()
      continue
    }
    return unexpected()
  }
}

function locationAt(text: string, index: number): ImportJsonTextLocation {
  const before = text.slice(0, index)
  const lastNewline = before.lastIndexOf('\n')
  return {
    column: index - lastNewline,
    line: before.split('\n').length,
  }
}

function describeSyntaxError(
  fieldText: string,
  source: JsonSource,
): ImportJsonProblem {
  const error = findJsonSyntaxError(source.text)
  if (!error) {
    return { character: null, kind: 'syntax', location: null, reason: null }
  }
  const codePoint = source.text.codePointAt(error.index)
  return {
    character:
      error.reason === 'unexpected-end' || codePoint === undefined
        ? null
        : String.fromCodePoint(codePoint),
    kind: 'syntax',
    location: locationAt(fieldText, source.offset + error.index),
    reason: error.reason,
  }
}

function valueTypeOf(value: unknown): ImportJsonValueType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'object':
    case 'string':
      return typeof value as ImportJsonValueType
    default:
      return 'unknown'
  }
}

function receivedTypeAt(
  input: unknown,
  path: readonly (number | string)[],
): 'missing' | ImportJsonValueType {
  let current: unknown = input
  for (const segment of path) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.hasOwn(current, segment)
    ) {
      return 'missing'
    }
    current = (current as Record<number | string, unknown>)[segment]
  }
  return current === undefined ? 'missing' : valueTypeOf(current)
}

function toSchemaIssue(
  issue: z.core.$ZodIssue,
  input: unknown,
): ImportJsonSchemaIssue {
  const path = issue.path.filter(
    (segment): segment is number | string => typeof segment !== 'symbol',
  )
  const result: ImportJsonSchemaIssue = {
    code: issue.code,
    message: issue.message,
    path,
  }
  switch (issue.code) {
    case 'invalid_type':
      result.expected = issue.expected
      result.received = receivedTypeAt(input, path)
      break
    case 'too_big':
      result.inclusive = issue.inclusive ?? true
      result.maximum = Number(issue.maximum)
      result.origin = issue.origin
      break
    case 'too_small':
      result.inclusive = issue.inclusive ?? true
      result.minimum = Number(issue.minimum)
      result.origin = issue.origin
      break
    case 'unrecognized_keys':
      result.keys = issue.keys
      break
    case 'invalid_value':
      result.values = issue.values
      break
  }
  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidImportJson<T>(
  problem: ImportJsonProblem,
  extractedFromCodeBlock = false,
): ImportJsonReadResult<T> {
  return { extractedFromCodeBlock, payload: null, problem }
}

function trimSourceStart(source: JsonSource): JsonSource {
  const text = source.text.trimStart()
  return {
    offset: source.offset + source.text.length - text.length,
    text,
  }
}

function readSource<T>(
  fieldText: string,
  source: JsonSource,
  schema: z.ZodType<T>,
  extractedFromCodeBlock: boolean,
): ImportJsonReadResult<T> {
  const invalid = (problem: ImportJsonProblem): ImportJsonReadResult<T> =>
    invalidImportJson(problem, extractedFromCodeBlock)
  let parsed: unknown
  try {
    parsed = JSON.parse(source.text)
  } catch {
    const json = trimSourceStart(source)
    // Nothing was extracted when a code block holds no JSON.
    if (!json.text.startsWith('{'))
      return invalidImportJson({ kind: 'no-json' })
    if (isTruncatedJsonText(json.text)) return invalid({ kind: 'truncated' })
    return invalid(describeSyntaxError(fieldText, json))
  }
  if (
    isPlainObject(parsed) &&
    parsed.schemaVersion !== REQUIREMENTS_IMPORT_SCHEMA_VERSION
  ) {
    return invalid({
      expectedVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      kind: 'wrong-version',
    })
  }
  const result = schema.safeParse(parsed)
  if (result.success) {
    return { extractedFromCodeBlock, payload: result.data, problem: null }
  }
  return invalid({
    issues: result.error.issues.map(issue => toSchemaIssue(issue, parsed)),
    kind: 'schema',
  })
}

/**
 * Reads requirement import JSON from the text in the import dialog.
 *
 * - Text that starts with `{` is validated against `schema` after a
 *   `schemaVersion` check.
 * - Other text may contain exactly one fenced code block, whose content is
 *   then read instead. Without a code block the text holds no JSON, also when
 *   it parses as an array, a string or a number. The caller's text is never
 *   changed.
 * - Several code blocks are rejected without extracting any of them.
 */
export function readRequirementImportJson<T>(
  text: string,
  schema: z.ZodType<T>,
): ImportJsonReadResult<T> {
  const direct = trimSourceStart({ offset: 0, text: text.trimEnd() })
  if (!direct.text) return invalidImportJson({ kind: 'no-json' })
  if (direct.text.startsWith('{')) {
    return readSource(text, direct, schema, false)
  }
  // Text that does not start with `{` is never a JSON object, even when it
  // parses as an array, a string or a number. Such a reply holds no import
  // JSON unless it contains a code block.
  const blocks = findCodeBlocks(text)
  if (blocks.length > 1) {
    return invalidImportJson({
      codeBlockCount: blocks.length,
      kind: 'multiple-code-blocks',
    })
  }
  const block = blocks[0]
  if (!block) return invalidImportJson({ kind: 'no-json' })
  return readSource(
    text,
    { offset: block.contentOffset, text: block.content },
    schema,
    true,
  )
}
