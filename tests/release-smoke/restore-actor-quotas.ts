import type { APIRequestContext, APIResponse } from '@playwright/test'
import type { AdminApplicationSettings } from '../../lib/application-settings'

const quotaFields = [
  'exportActorConcurrency',
  'exportActorStartsPerMinute',
] as const

type ActorQuotaSettings = Pick<
  AdminApplicationSettings,
  (typeof quotaFields)[number]
>

type QuotaRequest = {
  patch: (
    ...args: Parameters<APIRequestContext['patch']>
  ) => Promise<Pick<APIResponse, 'status'>>
  get: (
    url: string,
  ) => Promise<Pick<APIResponse<ActorQuotaSettings>, 'status' | 'json'>>
  dispose: APIRequestContext['dispose']
}

export async function restoreActorQuotasAndDispose(
  adminRequest: QuotaRequest,
  originalSettings: ActorQuotaSettings | undefined,
): Promise<void> {
  const failures: unknown[] = []
  try {
    if (originalSettings) {
      const restored = await Promise.allSettled(
        quotaFields.map(async field => {
          try {
            const response = await adminRequest.patch(
              '/api/admin/application-settings',
              { data: { [field]: originalSettings[field] } },
            )
            if (response.status() !== 200) {
              throw new Error(`HTTP ${response.status()}`)
            }
          } catch (cause) {
            throw new Error(`Failed to restore ${field}`, { cause })
          }
        }),
      )
      for (const result of restored) {
        if (result.status === 'rejected') failures.push(result.reason)
      }

      try {
        const response = await adminRequest.get(
          '/api/admin/application-settings',
        )
        if (response.status() !== 200) {
          throw new Error(
            `Settings readback returned HTTP ${response.status()}`,
          )
        }
        const settings = await response.json()
        for (const field of quotaFields) {
          if (settings[field] !== originalSettings[field]) {
            failures.push(
              new Error(`Restored ${field} does not match its saved value`),
            )
          }
        }
      } catch (cause) {
        failures.push(
          new Error('Failed to verify restored actor quotas', { cause }),
        )
      }
    }
  } finally {
    try {
      await adminRequest.dispose()
    } catch (cause) {
      failures.push(
        new Error('Failed to dispose administrator request context', { cause }),
      )
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Actor quota restoration failed')
  }
}
