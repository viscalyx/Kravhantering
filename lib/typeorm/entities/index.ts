import { deviationEntity } from '@/lib/typeorm/entities/deviation'
import { improvementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
import { normReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import { ownerEntity } from '@/lib/typeorm/entities/owner'
import { qualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import { requirementEntity } from '@/lib/typeorm/entities/requirement'
import { requirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import { requirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import { requirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
import { requirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
import { requirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
import { requirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import { requirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import { requirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
import { requirementVersionUsageScenarioEntity } from '@/lib/typeorm/entities/requirement-version-usage-scenario'
import { requirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import { requirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
import { riskLevelEntity } from '@/lib/typeorm/entities/risk-level'
import { specificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
import { specificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import { specificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
import { specificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
import { specificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'
import { specificationLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/specification-local-requirement-norm-reference'
import { specificationLocalRequirementUsageScenarioEntity } from '@/lib/typeorm/entities/specification-local-requirement-usage-scenario'
import { specificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'
import { specificationResponsibilityAreaEntity } from '@/lib/typeorm/entities/specification-responsibility-area'
import { uiTerminologyEntity } from '@/lib/typeorm/entities/ui-terminology'
import { usageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export const sqlServerEntities = [
  deviationEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  ownerEntity,
  specificationImplementationTypeEntity,
  specificationItemStatusEntity,
  specificationLifecycleStatusEntity,
  specificationLocalRequirementEntity,
  specificationLocalRequirementDeviationEntity,
  specificationLocalRequirementNormReferenceEntity,
  specificationLocalRequirementUsageScenarioEntity,
  specificationNeedsReferenceEntity,
  specificationResponsibilityAreaEntity,
  qualityCharacteristicEntity,
  requirementEntity,
  requirementAreaEntity,
  requirementCategoryEntity,
  requirementListColumnDefaultEntity,
  requirementsSpecificationEntity,
  requirementsSpecificationItemEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionUsageScenarioEntity,
  riskLevelEntity,
  uiTerminologyEntity,
  usageScenarioEntity,
]

export type { DeviationEntity } from '@/lib/typeorm/entities/deviation'
export type { ImprovementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
export type { NormReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
export type { OwnerEntity } from '@/lib/typeorm/entities/owner'
export type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
export type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
export type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
export type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
export type { RequirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
export type { RequirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
export type { RequirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
export type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
export type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
export type { RequirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
export type { RequirementVersionUsageScenarioEntity } from '@/lib/typeorm/entities/requirement-version-usage-scenario'
export type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
export type { RequirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
export type { RiskLevelEntity } from '@/lib/typeorm/entities/risk-level'
export type { SpecificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
export type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
export type { SpecificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
export type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
export type { SpecificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'
export type { SpecificationLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/specification-local-requirement-norm-reference'
export type { SpecificationLocalRequirementUsageScenarioEntity } from '@/lib/typeorm/entities/specification-local-requirement-usage-scenario'
export type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'
export type { SpecificationResponsibilityAreaEntity } from '@/lib/typeorm/entities/specification-responsibility-area'
export type { UiTerminologyEntity } from '@/lib/typeorm/entities/ui-terminology'
export type { UsageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export {
  deviationEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  ownerEntity,
  qualityCharacteristicEntity,
  requirementAreaEntity,
  requirementCategoryEntity,
  requirementEntity,
  requirementListColumnDefaultEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementsSpecificationEntity,
  requirementsSpecificationItemEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionUsageScenarioEntity,
  riskLevelEntity,
  specificationImplementationTypeEntity,
  specificationItemStatusEntity,
  specificationLifecycleStatusEntity,
  specificationLocalRequirementDeviationEntity,
  specificationLocalRequirementEntity,
  specificationLocalRequirementNormReferenceEntity,
  specificationLocalRequirementUsageScenarioEntity,
  specificationNeedsReferenceEntity,
  specificationResponsibilityAreaEntity,
  uiTerminologyEntity,
  usageScenarioEntity,
}
