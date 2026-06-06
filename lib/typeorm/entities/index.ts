import { accessReviewItemEntity } from '@/lib/typeorm/entities/access-review-item'
import { accessReviewRunEntity } from '@/lib/typeorm/entities/access-review-run'
import { actionAuditEventEntity } from '@/lib/typeorm/entities/action-audit-event'
import { archivingRetentionExceptionEntity } from '@/lib/typeorm/entities/archiving-retention-exception'
import { archivingRetentionPolicyEntity } from '@/lib/typeorm/entities/archiving-retention-policy'
import { archivingRetentionRunEntity } from '@/lib/typeorm/entities/archiving-retention-run'
import { deviationEntity } from '@/lib/typeorm/entities/deviation'
import { improvementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
import { normReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import { qualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import { requirementEntity } from '@/lib/typeorm/entities/requirement'
import { requirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import { requirementAreaCoAuthorEntity } from '@/lib/typeorm/entities/requirement-area-co-author'
import { requirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import { requirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
import { requirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import { requirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'
import { requirementSelectionAnswerPackageEntity } from '@/lib/typeorm/entities/requirement-selection-answer-package'
import { requirementSelectionAnswerRequirementEntity } from '@/lib/typeorm/entities/requirement-selection-answer-requirement'
import { requirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'
import { requirementSelectionQuestionSequenceEntity } from '@/lib/typeorm/entities/requirement-selection-question-sequence'
import { requirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
import { requirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
import { requirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import { requirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import { requirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
import { requirementVersionRequirementPackageEntity } from '@/lib/typeorm/entities/requirement-version-requirement-package'
import { requirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import { requirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
import { riskLevelEntity } from '@/lib/typeorm/entities/risk-level'
import { specificationCoAuthorEntity } from '@/lib/typeorm/entities/specification-co-author'
import { specificationGovernanceObjectTypeEntity } from '@/lib/typeorm/entities/specification-governance-object-type'
import { specificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
import { specificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import { specificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
import { specificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
import { specificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'
import { specificationLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/specification-local-requirement-norm-reference'
import { specificationLocalRequirementRequirementPackageEntity } from '@/lib/typeorm/entities/specification-local-requirement-requirement-package'
import { specificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'
import { specificationRequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/specification-requirement-selection-answer'

export const sqlServerEntities = [
  actionAuditEventEntity,
  accessReviewRunEntity,
  accessReviewItemEntity,
  deviationEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  archivingRetentionPolicyEntity,
  archivingRetentionRunEntity,
  archivingRetentionExceptionEntity,
  specificationImplementationTypeEntity,
  specificationItemStatusEntity,
  specificationLifecycleStatusEntity,
  specificationLocalRequirementEntity,
  specificationLocalRequirementDeviationEntity,
  specificationLocalRequirementNormReferenceEntity,
  specificationLocalRequirementRequirementPackageEntity,
  specificationNeedsReferenceEntity,
  specificationGovernanceObjectTypeEntity,
  qualityCharacteristicEntity,
  requirementEntity,
  requirementAreaEntity,
  requirementAreaCoAuthorEntity,
  requirementSelectionQuestionSequenceEntity,
  requirementSelectionQuestionEntity,
  requirementSelectionAnswerEntity,
  requirementSelectionAnswerPackageEntity,
  requirementSelectionAnswerRequirementEntity,
  requirementCategoryEntity,
  requirementListColumnDefaultEntity,
  requirementsSpecificationEntity,
  requirementsSpecificationItemEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionRequirementPackageEntity,
  riskLevelEntity,
  specificationCoAuthorEntity,
  specificationRequirementSelectionAnswerEntity,
  requirementPackageEntity,
]

export type { AccessReviewItemEntity } from '@/lib/typeorm/entities/access-review-item'
export type { AccessReviewRunEntity } from '@/lib/typeorm/entities/access-review-run'
export type { ActionAuditEventEntity } from '@/lib/typeorm/entities/action-audit-event'
export type { ArchivingRetentionExceptionEntity } from '@/lib/typeorm/entities/archiving-retention-exception'
export type { ArchivingRetentionPolicyEntity } from '@/lib/typeorm/entities/archiving-retention-policy'
export type { ArchivingRetentionRunEntity } from '@/lib/typeorm/entities/archiving-retention-run'
export type { DeviationEntity } from '@/lib/typeorm/entities/deviation'
export type { ImprovementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
export type { NormReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
export type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
export type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
export type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
export type { RequirementAreaCoAuthorEntity } from '@/lib/typeorm/entities/requirement-area-co-author'
export type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
export type { RequirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
export type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
export type { RequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'
export type { RequirementSelectionAnswerPackageEntity } from '@/lib/typeorm/entities/requirement-selection-answer-package'
export type { RequirementSelectionAnswerRequirementEntity } from '@/lib/typeorm/entities/requirement-selection-answer-requirement'
export type { RequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'
export type { RequirementSelectionQuestionSequenceEntity } from '@/lib/typeorm/entities/requirement-selection-question-sequence'
export type { RequirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
export type { RequirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
export type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
export type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
export type { RequirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
export type { RequirementVersionRequirementPackageEntity } from '@/lib/typeorm/entities/requirement-version-requirement-package'
export type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
export type { RequirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
export type { RiskLevelEntity } from '@/lib/typeorm/entities/risk-level'
export type { SpecificationCoAuthorEntity } from '@/lib/typeorm/entities/specification-co-author'
export type { SpecificationGovernanceObjectTypeEntity } from '@/lib/typeorm/entities/specification-governance-object-type'
export type { SpecificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
export type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
export type { SpecificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
export type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
export type { SpecificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'
export type { SpecificationLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/specification-local-requirement-norm-reference'
export type { SpecificationLocalRequirementRequirementPackageEntity } from '@/lib/typeorm/entities/specification-local-requirement-requirement-package'
export type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'
export type { SpecificationRequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/specification-requirement-selection-answer'

export {
  accessReviewItemEntity,
  accessReviewRunEntity,
  actionAuditEventEntity,
  archivingRetentionExceptionEntity,
  archivingRetentionPolicyEntity,
  archivingRetentionRunEntity,
  deviationEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  qualityCharacteristicEntity,
  requirementAreaCoAuthorEntity,
  requirementAreaEntity,
  requirementCategoryEntity,
  requirementEntity,
  requirementListColumnDefaultEntity,
  requirementPackageEntity,
  requirementSelectionAnswerEntity,
  requirementSelectionAnswerPackageEntity,
  requirementSelectionAnswerRequirementEntity,
  requirementSelectionQuestionEntity,
  requirementSelectionQuestionSequenceEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementsSpecificationEntity,
  requirementsSpecificationItemEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionRequirementPackageEntity,
  riskLevelEntity,
  specificationCoAuthorEntity,
  specificationGovernanceObjectTypeEntity,
  specificationImplementationTypeEntity,
  specificationItemStatusEntity,
  specificationLifecycleStatusEntity,
  specificationLocalRequirementDeviationEntity,
  specificationLocalRequirementEntity,
  specificationLocalRequirementNormReferenceEntity,
  specificationLocalRequirementRequirementPackageEntity,
  specificationNeedsReferenceEntity,
  specificationRequirementSelectionAnswerEntity,
}
