import { validationError } from '@/lib/requirements/errors'
import { isAiRequirementGenerationDisabled } from './scan-guard'

const SAFE_ENVIRONMENT_ID = /^[A-Za-z0-9._:-]{1,160}$/u

export function assertAiStagingLiveVerificationAllowed(
  expectedEnvironmentId: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const actualEnvironmentId =
    env.KRAVHANTERING_DEPLOYMENT_ENVIRONMENT_ID?.trim()
  const allowed =
    env.KRAVHANTERING_DEPLOYMENT_ENVIRONMENT === 'staging' &&
    env.AI_STAGING_LIVE_PROBE_ENABLED === '1' &&
    isAiRequirementGenerationDisabled(env) &&
    SAFE_ENVIRONMENT_ID.test(expectedEnvironmentId) &&
    actualEnvironmentId !== undefined &&
    SAFE_ENVIRONMENT_ID.test(actualEnvironmentId) &&
    actualEnvironmentId === expectedEnvironmentId
  if (!allowed) {
    throw validationError('Staging live verification is not authorized.')
  }
}
