export interface AiRequirementGenerationAvailability {
  disabledByEnvironment: boolean
  effectiveRequirementGenerationEnabled: boolean
  requirementGenerationEnabled: boolean
}

export const DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY: AiRequirementGenerationAvailability =
  Object.freeze({
    disabledByEnvironment: false,
    effectiveRequirementGenerationEnabled: true,
    requirementGenerationEnabled: true,
  })
