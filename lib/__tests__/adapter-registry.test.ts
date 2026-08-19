import { describe, expect, it } from 'vitest'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import type {
  AiConnectionAdapterRegistration,
  AiRunEvent,
} from '@/lib/ai/run-contracts'

function registration(
  adapterType: string,
  adapterVersion = 'test-version',
): AiConnectionAdapterRegistration {
  return {
    adapter: {
      forceClose: () => undefined,
      async *run() {
        yield* [] as AiRunEvent[]
      },
    },
    adapterType,
    adapterVersion,
  }
}

describe('AI connection adapter registry', () => {
  it('rejects duplicate adapter type and version pairs', () => {
    expect(() =>
      createAiConnectionAdapterRegistry([
        registration('duplicate'),
        registration('duplicate'),
      ]),
    ).toThrow('Duplicate AI connection adapter: duplicate@test-version')
  })

  it('rejects resolution of an unregistered adapter type and version', () => {
    const registry = createAiConnectionAdapterRegistry([])

    expect(() => registry.resolve('missing', '1')).toThrow(
      'Unknown AI connection adapter: missing@1',
    )
  })

  it('resolves only the exact registered adapter version', () => {
    const registry = createAiConnectionAdapterRegistry([registration('first')])

    expect(registry.resolve('first', 'test-version')).toBeDefined()
    expect(() => registry.resolve('first', 'other-version')).toThrow(
      'Unknown AI connection adapter: first@other-version',
    )
  })

  it('registers multiple versions of one adapter type independently', () => {
    const first = registration('versioned', '1')
    const second = registration('versioned', '2')
    const registry = createAiConnectionAdapterRegistry([first, second])

    expect(registry.resolve('versioned', '1')).toBe(first.adapter)
    expect(registry.resolve('versioned', '2')).toBe(second.adapter)
  })
})
