import type {
  AIConnectionAdapter,
  AiConnectionAdapterRegistration,
} from './run-contracts'

export interface AiConnectionAdapterRegistry {
  resolve(adapterType: string, adapterVersion?: string): AIConnectionAdapter
}

export function createAiConnectionAdapterRegistry(
  registrations: readonly AiConnectionAdapterRegistration[],
): AiConnectionAdapterRegistry {
  const adapters = new Map<string, AiConnectionAdapterRegistration>()
  for (const registration of registrations) {
    if (adapters.has(registration.adapterType)) {
      throw new Error(
        `Duplicate AI connection adapter type: ${registration.adapterType}`,
      )
    }
    adapters.set(registration.adapterType, registration)
  }

  return {
    resolve(adapterType: string, adapterVersion?: string): AIConnectionAdapter {
      const registration = adapters.get(adapterType)
      if (
        !registration ||
        (adapterVersion !== undefined &&
          registration.adapterVersion !== adapterVersion)
      ) {
        throw new Error(`Unknown AI connection adapter type: ${adapterType}`)
      }
      return registration.adapter
    },
  }
}
