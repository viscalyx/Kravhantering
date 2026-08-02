import { describe, expect, it } from 'vitest'
import { parseJsonc } from './test-helpers'

describe('test helpers', () => {
  it('reports readable JSONC parse errors with their offsets', () => {
    expect(() => parseJsonc('{ invalid: , trailing }')).toThrow(
      /Invalid JSONC: .+ at offset \d+/u,
    )
  })
})
