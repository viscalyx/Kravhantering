import type { APIRequestContext } from '@playwright/test'
import { expectApiResponseOk } from './api-response-assertions'

export interface AiGenerationAvailability {
  aiSafetyRuleCacheTtlSeconds: number
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  mcpImportMaxActiveSessionsPerDestination: number
  mcpImportMaxActiveSessionsPerPrincipal: number
  mcpImportMaxCreationsPerWindow: number
  mcpImportMaxReservedBytes: number
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
  mcpMaxRequestBytes: number
  requirementGenerationEnabled: boolean
}

export type AiGenerationSettingsPayload = Pick<
  AiGenerationAvailability,
  | 'aiSafetyRuleCacheTtlSeconds'
  | 'mcpImportMaxRows'
  | 'mcpImportValidationTtlMinutes'
  | 'mcpMaxRequestBytes'
  | 'requirementGenerationEnabled'
> &
  Partial<
    Pick<
      AiGenerationAvailability,
      | 'mcpImportMaxActiveSessionsPerDestination'
      | 'mcpImportMaxActiveSessionsPerPrincipal'
      | 'mcpImportMaxCreationsPerWindow'
      | 'mcpImportMaxReservedBytes'
    >
  >

export async function getAiSettings(
  request: APIRequestContext,
): Promise<AiGenerationAvailability> {
  const response = await request.get('/api/admin/ai-settings')
  await expectApiResponseOk(response, 'GET AI settings')
  return (await response.json()) as AiGenerationAvailability
}

export async function putAiSettings(
  request: APIRequestContext,
  settings: AiGenerationSettingsPayload,
): Promise<AiGenerationAvailability> {
  const current = await getAiSettings(request)
  const response = await request.put('/api/admin/ai-settings', {
    data: {
      ...settings,
      mcpImportMaxActiveSessionsPerDestination:
        settings.mcpImportMaxActiveSessionsPerDestination ??
        current.mcpImportMaxActiveSessionsPerDestination,
      mcpImportMaxActiveSessionsPerPrincipal:
        settings.mcpImportMaxActiveSessionsPerPrincipal ??
        current.mcpImportMaxActiveSessionsPerPrincipal,
      mcpImportMaxCreationsPerWindow:
        settings.mcpImportMaxCreationsPerWindow ??
        current.mcpImportMaxCreationsPerWindow,
      mcpImportMaxReservedBytes:
        settings.mcpImportMaxReservedBytes ?? current.mcpImportMaxReservedBytes,
    },
  })
  await expectApiResponseOk(response, 'PUT AI settings')
  return (await response.json()) as AiGenerationAvailability
}
