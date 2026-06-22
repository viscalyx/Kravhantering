export const AI_REQUIREMENT_GENERATION_DISABLED_ENV =
  'AI_REQUIREMENT_GENERATION_DISABLED'

export function isAiRequirementGenerationDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[AI_REQUIREMENT_GENERATION_DISABLED_ENV]
  return value === '1' || value?.toLowerCase() === 'true'
}
