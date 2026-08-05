import { describe, expect, it } from 'vitest'
import {
  compareMcpSearchMatches,
  findMcpSearchMatch,
  normalizeMcpSearchText,
} from '@/lib/requirements/mcp-search'

describe('MCP search helpers', () => {
  it('preserves Swedish search letters during normalization', () => {
    expect(
      normalizeMcpSearchText('\u00c5  \u00c4  \u00d6  \u00e5  \u00e4  \u00f6'),
    ).toBe('\u00e5 \u00e4 \u00f6 \u00e5 \u00e4 \u00f6')
  })

  it('does not match Swedish letters as plain vowels', () => {
    expect(findMcpSearchMatch({ name: 'M\u00e4ta' }, 'mata')).toBeNull()
    expect(findMcpSearchMatch({ name: 'Cafe\u0301' }, 'cafe')).toMatchObject({
      matchedFields: ['name'],
      quality: 'normalizedExact',
    })
  })

  it('matches observable field values at each supported quality', () => {
    expect(
      findMcpSearchMatch(
        {
          empty: ' ',
          exact: 'Secure API',
          missing: null,
          normalized: 'Cafe\u0301',
          partial: 'An encrypted secure API endpoint',
          prefix: 'Secure API endpoint',
        },
        'Secure API',
      ),
    ).toEqual({
      matchedFields: ['exact', 'partial', 'prefix'],
      quality: 'exact',
    })
    expect(findMcpSearchMatch({ name: 'Cafe\u0301' }, 'CAFÉ')).toEqual({
      matchedFields: ['name'],
      quality: 'normalizedExact',
    })
    expect(
      findMcpSearchMatch({ name: 'Secure API endpoint' }, 'secure'),
    ).toEqual({ matchedFields: ['name'], quality: 'startsWith' })
    expect(
      findMcpSearchMatch({ name: 'An encrypted endpoint' }, 'crypt'),
    ).toEqual({ matchedFields: ['name'], quality: 'contains' })
  })

  it('rejects empty searches and fields with no match', () => {
    expect(findMcpSearchMatch({ name: 'Requirement' }, '  ')).toBeNull()
    expect(findMcpSearchMatch({ name: 'Requirement' }, 'unrelated')).toBeNull()
    expect(findMcpSearchMatch({ numericId: 42 }, '42')).toEqual({
      matchedFields: ['numericId'],
      quality: 'exact',
    })
  })

  it('orders matches by their client-facing match quality', () => {
    expect(
      compareMcpSearchMatches(
        { matchedFields: ['name'], quality: 'exact' },
        { matchedFields: ['name'], quality: 'contains' },
      ),
    ).toBeLessThan(0)
    expect(
      compareMcpSearchMatches(
        { matchedFields: ['name'], quality: 'startsWith' },
        { matchedFields: ['name'], quality: 'normalizedExact' },
      ),
    ).toBeGreaterThan(0)
  })
})
