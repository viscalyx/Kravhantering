export const REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES = [
  'requirement_area_owner',
  'requirement_area_co_author',
  'requirement_package_co_author',
  'requirement_package_lead',
  'requirements_specification_responsible',
  'requirements_specification_co_author',
] as const

export type RequirementResponsibilityPersonVerificationPurpose =
  (typeof REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES)[number]
