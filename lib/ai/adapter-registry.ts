import type {
  AIConnectionAdapter,
  AiConnectionAdapterRegistration,
} from './run-contracts'

export interface AiConnectionAdapterRegistry {
  resolve(adapterType: string): AIConnectionAdapter
}

export function createAiConnectionAdapterRegistry(
  registrations: readonly AiConnectionAdapterRegistration[],
): AiConnectionAdapterRegistry {
  const adapters = new Map<string, AIConnectionAdapter>()
  for (const registration of registrations) {
    if (adapters.has(registration.adapterType)) {
      throw new Error(
        `Duplicate AI connection adapter type: ${registration.adapterType}`,
      )
    }
    adapters.set(registration.adapterType, registration.adapter)
  }

  return {
    resolve(adapterType: string): AIConnectionAdapter {
      const adapter = adapters.get(adapterType)
      if (!adapter) {
        throw new Error(`Unknown AI connection adapter type: ${adapterType}`)
      }
      return adapter
    },
  }
}
