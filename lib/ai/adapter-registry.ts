import type {
  AIConnectionAdapter,
  AiConnectionAdapterRegistration,
} from './run-contracts'

export interface AiConnectionAdapterRegistry {
  resolve(adapterType: string, adapterVersion: string): AIConnectionAdapter
}

function registrationKey(adapterType: string, adapterVersion: string): string {
  return JSON.stringify([adapterType, adapterVersion])
}

export function createAiConnectionAdapterRegistry(
  registrations: readonly AiConnectionAdapterRegistration[],
): AiConnectionAdapterRegistry {
  const adapters = new Map<string, AiConnectionAdapterRegistration>()
  for (const registration of registrations) {
    const key = registrationKey(
      registration.adapterType,
      registration.adapterVersion,
    )
    if (adapters.has(key)) {
      throw new Error(
        `Duplicate AI connection adapter: ${registration.adapterType}@${registration.adapterVersion}`,
      )
    }
    adapters.set(key, registration)
  }

  return {
    resolve(adapterType: string, adapterVersion: string): AIConnectionAdapter {
      const registration = adapters.get(
        registrationKey(adapterType, adapterVersion),
      )
      if (!registration) {
        throw new Error(
          `Unknown AI connection adapter: ${adapterType}@${adapterVersion}`,
        )
      }
      return registration.adapter
    },
  }
}
