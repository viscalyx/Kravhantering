import type { APIRequestContext } from '@playwright/test'
import { expectApiResponseOk } from './api-response-assertions'

export interface AiGenerationAvailability {
  aiSafetyForensicLoggingEnabled: boolean
  aiSafetyRuleCacheTtlSeconds: number
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  mcpImportMaxRows: number
  mcpImportValidationTtlMinutes: number
  mcpMaxRequestBytes: number
  requirementGenerationEnabled: boolean
}

export type AiGenerationSettingsPayload = Pick<
  AiGenerationAvailability,
  | 'aiSafetyForensicLoggingEnabled'
  | 'aiSafetyRuleCacheTtlSeconds'
  | 'mcpImportMaxRows'
  | 'mcpImportValidationTtlMinutes'
  | 'mcpMaxRequestBytes'
  | 'requirementGenerationEnabled'
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
  const response = await request.put('/api/admin/ai-settings', {
    data: settings,
  })
  await expectApiResponseOk(response, 'PUT AI settings')
  return (await response.json()) as AiGenerationAvailability
}
