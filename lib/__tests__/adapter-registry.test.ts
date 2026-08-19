import { describe, expect, it } from 'vitest'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import type {
  AiConnectionAdapterRegistration,
  AiRunEvent,
} from '@/lib/ai/run-contracts'

function registration(adapterType: string): AiConnectionAdapterRegistration {
  return {
    adapter: {
      async *run() {
        yield* [] as AiRunEvent[]
      },
    },
    adapterType,
    adapterVersion: 'test-version',
  }
}

describe('AI connection adapter registry', () => {
  it('rejects duplicate adapter types', () => {
    expect(() =>
      createAiConnectionAdapterRegistry([
        registration('duplicate'),
        registration('duplicate'),
      ]),
    ).toThrow('Duplicate AI connection adapter type: duplicate')
  })

  it('rejects resolution of an unregistered adapter type', () => {
    const registry = createAiConnectionAdapterRegistry([])

    expect(() => registry.resolve('missing')).toThrow(
      'Unknown AI connection adapter type: missing',
    )
  })

  it('resolves only the exact registered adapter version', () => {
    const registry = createAiConnectionAdapterRegistry([registration('first')])

    expect(registry.resolve('first', 'test-version')).toBeDefined()
    expect(() => registry.resolve('first', 'other-version')).toThrow(
      'Unknown AI connection adapter type: first',
    )
  })
})
