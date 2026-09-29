import { describe, expect, it } from 'vitest'
import { getPromptMessage, getPromptValue } from '@/lib/ai/requirement-prompt'

type PromptShape =
  | { kind: 'string'; placeholders: string[] }
  | { items: PromptShape[]; kind: 'list' }
  | { entries: Record<string, PromptShape>; kind: 'object' }
  | { kind: 'other'; type: string }

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)]
    .map(match => match[1] ?? '')
    .sort()
}

function promptShape(value: unknown): PromptShape {
  if (typeof value === 'string') {
    return { kind: 'string', placeholders: placeholdersIn(value) }
  }
  if (Array.isArray(value)) {
    return { items: value.map(item => promptShape(item)), kind: 'list' }
  }
  if (typeof value === 'object' && value !== null) {
    return {
      entries: Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, promptShape(item)]),
      ),
      kind: 'object',
    }
  }
  return { kind: 'other', type: value === null ? 'null' : typeof value }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(item => collectStrings(item))
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(item => collectStrings(item))
  }
  return []
}

describe('ai.prompt localization parity', () => {
  it('has the same keys, list lengths, and value placeholders in sv and en', () => {
    const sv = getPromptValue('sv', ['ai', 'prompt'])
    const en = getPromptValue('en', ['ai', 'prompt'])

    expect(promptShape(sv)).toEqual(promptShape(en))
  })

  it.each([
    'title',
    'rulesHeading',
    'conflictsHeading',
    'fieldSelectionHeading',
    'referenceDataHeading',
  ])('translates the import instruction heading %s', key => {
    const path = ['ai', 'prompt', 'importInstruction', key]

    expect(getPromptMessage('sv', path)).not.toBe(getPromptMessage('en', path))
  })

  it.each(['en', 'sv'] as const)(
    'contains only non-empty prompt strings for %s',
    locale => {
      const strings = collectStrings(getPromptValue(locale, ['ai', 'prompt']))

      expect(strings.length).toBeGreaterThan(0)
      for (const text of strings) {
        expect(text.trim()).not.toBe('')
      }
    },
  )
})
