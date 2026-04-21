import { deviationEntity } from '@/lib/typeorm/entities/deviation'
import { improvementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
import { normReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import { ownerEntity } from '@/lib/typeorm/entities/owner'
import { packageImplementationTypeEntity } from '@/lib/typeorm/entities/package-implementation-type'
import { packageItemStatusEntity } from '@/lib/typeorm/entities/package-item-status'
import { packageLifecycleStatusEntity } from '@/lib/typeorm/entities/package-lifecycle-status'
import { packageLocalRequirementEntity } from '@/lib/typeorm/entities/package-local-requirement'
import { packageLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/package-local-requirement-deviation'
import { packageLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/package-local-requirement-norm-reference'
import { packageLocalRequirementUsageScenarioEntity } from '@/lib/typeorm/entities/package-local-requirement-usage-scenario'
import { packageNeedsReferenceEntity } from '@/lib/typeorm/entities/package-needs-reference'
import { packageResponsibilityAreaEntity } from '@/lib/typeorm/entities/package-responsibility-area'
import { qualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import { requirementEntity } from '@/lib/typeorm/entities/requirement'
import { requirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import { requirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import { requirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
import { requirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import { requirementPackageItemEntity } from '@/lib/typeorm/entities/requirement-package-item'
import { requirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
import { requirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
import { requirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import { requirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import { requirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
import { requirementVersionUsageScenarioEntity } from '@/lib/typeorm/entities/requirement-version-usage-scenario'
import { riskLevelEntity } from '@/lib/typeorm/entities/risk-level'
import { uiTerminologyEntity } from '@/lib/typeorm/entities/ui-terminology'
import { usageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export const sqlServerEntities = [
  deviationEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  ownerEntity,
  packageImplementationTypeEntity,
  packageItemStatusEntity,
  packageLifecycleStatusEntity,
  packageLocalRequirementEntity,
  packageLocalRequirementDeviationEntity,
  packageLocalRequirementNormReferenceEntity,
  packageLocalRequirementUsageScenarioEntity,
  packageNeedsReferenceEntity,
  packageResponsibilityAreaEntity,
  qualityCharacteristicEntity,
  requirementEntity,
  requirementAreaEntity,
  requirementCategoryEntity,
  requirementListColumnDefaultEntity,
  requirementPackageEntity,
  requirementPackageItemEntity,
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
export type { PackageImplementationTypeEntity } from '@/lib/typeorm/entities/package-implementation-type'
export type { PackageItemStatusEntity } from '@/lib/typeorm/entities/package-item-status'
export type { PackageLifecycleStatusEntity } from '@/lib/typeorm/entities/package-lifecycle-status'
export type { PackageLocalRequirementEntity } from '@/lib/typeorm/entities/package-local-requirement'
export type { PackageLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/package-local-requirement-deviation'
export type { PackageLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/package-local-requirement-norm-reference'
export type { PackageLocalRequirementUsageScenarioEntity } from '@/lib/typeorm/entities/package-local-requirement-usage-scenario'
export type { PackageNeedsReferenceEntity } from '@/lib/typeorm/entities/package-needs-reference'
export type { PackageResponsibilityAreaEntity } from '@/lib/typeorm/entities/package-responsibility-area'
export type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
export type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
export type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
export type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
export type { RequirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
export type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
export type { RequirementPackageItemEntity } from '@/lib/typeorm/entities/requirement-package-item'
export type { RequirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
export type { RequirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
export type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
export type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
export type { RequirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
export type { RequirementVersionUsageScenarioEntity } from '@/lib/typeorm/entities/requirement-version-usage-scenario'
export type { RiskLevelEntity } from '@/lib/typeorm/entities/risk-level'
export type { UiTerminologyEntity } from '@/lib/typeorm/entities/ui-terminology'
export type { UsageScenarioEntity } from '@/lib/typeorm/entities/usage-scenario'

export {
  deviationEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  ownerEntity,
  packageImplementationTypeEntity,
  packageItemStatusEntity,
  packageLifecycleStatusEntity,
  packageLocalRequirementDeviationEntity,
  packageLocalRequirementEntity,
  packageLocalRequirementNormReferenceEntity,
  packageLocalRequirementUsageScenarioEntity,
  packageNeedsReferenceEntity,
  packageResponsibilityAreaEntity,
  qualityCharacteristicEntity,
  requirementAreaEntity,
  requirementCategoryEntity,
  requirementEntity,
  requirementListColumnDefaultEntity,
  requirementPackageEntity,
  requirementPackageItemEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionUsageScenarioEntity,
  riskLevelEntity,
  uiTerminologyEntity,
  usageScenarioEntity,
}
