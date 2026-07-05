import { describe, expect, it } from 'vitest'
import {
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
})
