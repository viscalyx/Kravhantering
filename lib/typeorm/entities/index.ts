import { accessReviewItemEntity } from '@/lib/typeorm/entities/access-review-item'
import { accessReviewRunEntity } from '@/lib/typeorm/entities/access-review-run'
import { actionAuditEventEntity } from '@/lib/typeorm/entities/action-audit-event'
import { aiConnectionEntity } from '@/lib/typeorm/entities/ai-connection'
import { aiConnectionAttestationEntity } from '@/lib/typeorm/entities/ai-connection-attestation'
import { aiConnectionModelEntity } from '@/lib/typeorm/entities/ai-connection-model'
import { aiConnectionModelOperationalStateEntity } from '@/lib/typeorm/entities/ai-connection-model-operational-state'
import { aiConnectionModelRevisionEntity } from '@/lib/typeorm/entities/ai-connection-model-revision'
import { aiConnectionModelVerificationEvidenceEntity } from '@/lib/typeorm/entities/ai-connection-model-verification-evidence'
import { aiConnectionVerificationEvidenceEntity } from '@/lib/typeorm/entities/ai-connection-verification-evidence'
import { aiForensicCaptureWindowEntity } from '@/lib/typeorm/entities/ai-forensic-capture-window'
import { aiForensicEvidenceEventEntity } from '@/lib/typeorm/entities/ai-forensic-evidence-event'
import { aiModelVerificationAttemptEntity } from '@/lib/typeorm/entities/ai-model-verification-attempt'
import { aiProviderSecretVersionEntity } from '@/lib/typeorm/entities/ai-provider-secret-version'
import { aiRunCoordinationEntity } from '@/lib/typeorm/entities/ai-run-coordination'
import { aiRunProfileEntity } from '@/lib/typeorm/entities/ai-run-profile'
import { aiSafetyRuleEntity } from '@/lib/typeorm/entities/ai-safety-rule'
import { aiSafetyRuleTermEntity } from '@/lib/typeorm/entities/ai-safety-rule-term'
import { aiSettingEntity } from '@/lib/typeorm/entities/ai-setting'
import { applicationSettingEntity } from '@/lib/typeorm/entities/application-setting'
import { archivingRetentionExceptionEntity } from '@/lib/typeorm/entities/archiving-retention-exception'
import { archivingRetentionPolicyEntity } from '@/lib/typeorm/entities/archiving-retention-policy'
import { archivingRetentionRunEntity } from '@/lib/typeorm/entities/archiving-retention-run'
import { deviationEntity } from '@/lib/typeorm/entities/deviation'
import { hsaIdPrefixEntity } from '@/lib/typeorm/entities/hsa-id-prefix'
import { hsaVerificationQuotaBucketEntity } from '@/lib/typeorm/entities/hsa-verification-quota-bucket'
import { improvementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
import { normReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import { priorityLevelEntity } from '@/lib/typeorm/entities/priority-level'
import { qualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
import { requirementEntity } from '@/lib/typeorm/entities/requirement'
import { requirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import { requirementAreaCoAuthorEntity } from '@/lib/typeorm/entities/requirement-area-co-author'
import { requirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
import { requirementImportValidationRateBucketEntity } from '@/lib/typeorm/entities/requirement-import-validation-rate-bucket'
import { requirementImportValidationSessionEntity } from '@/lib/typeorm/entities/requirement-import-validation-session'
import { requirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
import { requirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import { requirementPackageCoAuthorEntity } from '@/lib/typeorm/entities/requirement-package-co-author'
import { requirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'
import { requirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'
import { requirementSelectionAnswerPackageEntity } from '@/lib/typeorm/entities/requirement-selection-answer-package'
import { requirementSelectionAnswerRequirementEntity } from '@/lib/typeorm/entities/requirement-selection-answer-requirement'
import { requirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'
import { requirementSelectionQuestionSequenceEntity } from '@/lib/typeorm/entities/requirement-selection-question-sequence'
import { requirementSelectionQuestionVisibilityConditionEntity } from '@/lib/typeorm/entities/requirement-selection-question-visibility-condition'
import { requirementSelectionQuestionVisibilityGroupEntity } from '@/lib/typeorm/entities/requirement-selection-question-visibility-group'
import { requirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
import { requirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
import { requirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
import { requirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
import { requirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
import { requirementVersionRequirementPackageEntity } from '@/lib/typeorm/entities/requirement-version-requirement-package'
import { requirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import { requirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
import { rfiQuestionEntity } from '@/lib/typeorm/entities/rfi-question'
import { rfiQuestionSequenceEntity } from '@/lib/typeorm/entities/rfi-question-sequence'
import { rfiQuestionSuggestionEntity } from '@/lib/typeorm/entities/rfi-question-suggestion'
import { rfiQuestionVersionEntity } from '@/lib/typeorm/entities/rfi-question-version'
import { rfiQuestionVersionRequirementEntity } from '@/lib/typeorm/entities/rfi-question-version-requirement'
import { rfiQuestionVersionRequirementPackageEntity } from '@/lib/typeorm/entities/rfi-question-version-requirement-package'
import { rfiQuestionVersionRequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/rfi-question-version-requirement-selection-question'
import { specificationCoAuthorEntity } from '@/lib/typeorm/entities/specification-co-author'
import { specificationGovernanceObjectTypeEntity } from '@/lib/typeorm/entities/specification-governance-object-type'
import { specificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
import { specificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
import { specificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
import { specificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
import { specificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'
import { specificationLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/specification-local-requirement-norm-reference'
import { specificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'
import { specificationRequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/specification-requirement-selection-answer'
import { specificationRfiListEntity } from '@/lib/typeorm/entities/specification-rfi-list'
import { specificationRfiQuestionItemEntity } from '@/lib/typeorm/entities/specification-rfi-question-item'

export const sqlServerEntities = [
  aiModelVerificationAttemptEntity,
  actionAuditEventEntity,
  aiConnectionEntity,
  aiConnectionAttestationEntity,
  aiConnectionVerificationEvidenceEntity,
  aiConnectionModelEntity,
  aiConnectionModelRevisionEntity,
  aiConnectionModelVerificationEvidenceEntity,
  aiRunProfileEntity,
  aiRunCoordinationEntity,
  aiConnectionModelOperationalStateEntity,
  aiProviderSecretVersionEntity,
  aiForensicCaptureWindowEntity,
  aiForensicEvidenceEventEntity,
  aiSettingEntity,
  applicationSettingEntity,
  aiSafetyRuleEntity,
  aiSafetyRuleTermEntity,
  accessReviewRunEntity,
  accessReviewItemEntity,
  deviationEntity,
  improvementSuggestionEntity,
  hsaIdPrefixEntity,
  hsaVerificationQuotaBucketEntity,
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
  specificationNeedsReferenceEntity,
  specificationGovernanceObjectTypeEntity,
  qualityCharacteristicEntity,
  requirementResponsibilityPersonEntity,
  requirementEntity,
  requirementAreaEntity,
  requirementAreaCoAuthorEntity,
  requirementSelectionQuestionSequenceEntity,
  requirementSelectionQuestionEntity,
  requirementSelectionQuestionVisibilityGroupEntity,
  requirementSelectionQuestionVisibilityConditionEntity,
  requirementSelectionAnswerEntity,
  requirementSelectionAnswerPackageEntity,
  requirementSelectionAnswerRequirementEntity,
  rfiQuestionSequenceEntity,
  rfiQuestionEntity,
  rfiQuestionVersionEntity,
  rfiQuestionVersionRequirementSelectionQuestionEntity,
  rfiQuestionVersionRequirementPackageEntity,
  rfiQuestionVersionRequirementEntity,
  specificationRfiListEntity,
  specificationRfiQuestionItemEntity,
  rfiQuestionSuggestionEntity,
  requirementCategoryEntity,
  requirementImportValidationRateBucketEntity,
  requirementImportValidationSessionEntity,
  requirementListColumnDefaultEntity,
  requirementsSpecificationEntity,
  requirementsSpecificationItemEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionRequirementPackageEntity,
  priorityLevelEntity,
  specificationCoAuthorEntity,
  specificationRequirementSelectionAnswerEntity,
  requirementPackageEntity,
  requirementPackageCoAuthorEntity,
]

export type { AccessReviewItemEntity } from '@/lib/typeorm/entities/access-review-item'
export type { AccessReviewRunEntity } from '@/lib/typeorm/entities/access-review-run'
export type { ActionAuditEventEntity } from '@/lib/typeorm/entities/action-audit-event'
export type { AiConnectionEntity } from '@/lib/typeorm/entities/ai-connection'
export type { AiConnectionAttestationEntity } from '@/lib/typeorm/entities/ai-connection-attestation'
export type { AiConnectionModelEntity } from '@/lib/typeorm/entities/ai-connection-model'
export type { AiConnectionModelOperationalStateEntity } from '@/lib/typeorm/entities/ai-connection-model-operational-state'
export type { AiConnectionModelRevisionEntity } from '@/lib/typeorm/entities/ai-connection-model-revision'
export type { AiConnectionModelVerificationEvidenceEntity } from '@/lib/typeorm/entities/ai-connection-model-verification-evidence'
export type { AiConnectionVerificationEvidenceEntity } from '@/lib/typeorm/entities/ai-connection-verification-evidence'
export type { AiForensicCaptureWindowEntity } from '@/lib/typeorm/entities/ai-forensic-capture-window'
export type { AiForensicEvidenceEventEntity } from '@/lib/typeorm/entities/ai-forensic-evidence-event'
export type { AiProviderSecretVersionEntity } from '@/lib/typeorm/entities/ai-provider-secret-version'
export type { AiRunCoordinationEntity } from '@/lib/typeorm/entities/ai-run-coordination'
export type { AiRunProfileEntity } from '@/lib/typeorm/entities/ai-run-profile'
export type { AiSafetyRuleEntity } from '@/lib/typeorm/entities/ai-safety-rule'
export type { AiSafetyRuleTermEntity } from '@/lib/typeorm/entities/ai-safety-rule-term'
export type { AiSettingEntity } from '@/lib/typeorm/entities/ai-setting'
export type { ApplicationSettingEntity } from '@/lib/typeorm/entities/application-setting'
export type { ArchivingRetentionExceptionEntity } from '@/lib/typeorm/entities/archiving-retention-exception'
export type { ArchivingRetentionPolicyEntity } from '@/lib/typeorm/entities/archiving-retention-policy'
export type { ArchivingRetentionRunEntity } from '@/lib/typeorm/entities/archiving-retention-run'
export type { DeviationEntity } from '@/lib/typeorm/entities/deviation'
export type { HsaIdPrefixEntity } from '@/lib/typeorm/entities/hsa-id-prefix'
export type { HsaVerificationQuotaBucketEntity } from '@/lib/typeorm/entities/hsa-verification-quota-bucket'
export type { ImprovementSuggestionEntity } from '@/lib/typeorm/entities/improvement-suggestion'
export type { NormReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
export type { PriorityLevelEntity } from '@/lib/typeorm/entities/priority-level'
export type { QualityCharacteristicEntity } from '@/lib/typeorm/entities/quality-characteristic'
export type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
export type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
export type { RequirementAreaCoAuthorEntity } from '@/lib/typeorm/entities/requirement-area-co-author'
export type { RequirementCategoryEntity } from '@/lib/typeorm/entities/requirement-category'
export type { RequirementImportValidationRateBucketEntity } from '@/lib/typeorm/entities/requirement-import-validation-rate-bucket'
export type { RequirementImportValidationSessionEntity } from '@/lib/typeorm/entities/requirement-import-validation-session'
export type { RequirementListColumnDefaultEntity } from '@/lib/typeorm/entities/requirement-list-column-default'
export type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
export type { RequirementPackageCoAuthorEntity } from '@/lib/typeorm/entities/requirement-package-co-author'
export type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'
export type { RequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'
export type { RequirementSelectionAnswerPackageEntity } from '@/lib/typeorm/entities/requirement-selection-answer-package'
export type { RequirementSelectionAnswerRequirementEntity } from '@/lib/typeorm/entities/requirement-selection-answer-requirement'
export type { RequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'
export type { RequirementSelectionQuestionSequenceEntity } from '@/lib/typeorm/entities/requirement-selection-question-sequence'
export type { RequirementSelectionQuestionVisibilityConditionEntity } from '@/lib/typeorm/entities/requirement-selection-question-visibility-condition'
export type { RequirementSelectionQuestionVisibilityGroupEntity } from '@/lib/typeorm/entities/requirement-selection-question-visibility-group'
export type { RequirementStatusEntity } from '@/lib/typeorm/entities/requirement-status'
export type { RequirementStatusTransitionEntity } from '@/lib/typeorm/entities/requirement-status-transition'
export type { RequirementTypeEntity } from '@/lib/typeorm/entities/requirement-type'
export type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'
export type { RequirementVersionNormReferenceEntity } from '@/lib/typeorm/entities/requirement-version-norm-reference'
export type { RequirementVersionRequirementPackageEntity } from '@/lib/typeorm/entities/requirement-version-requirement-package'
export type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
export type { RequirementsSpecificationItemEntity } from '@/lib/typeorm/entities/requirements-specification-item'
export type { RfiQuestionEntity } from '@/lib/typeorm/entities/rfi-question'
export type { RfiQuestionSequenceEntity } from '@/lib/typeorm/entities/rfi-question-sequence'
export type { RfiQuestionSuggestionEntity } from '@/lib/typeorm/entities/rfi-question-suggestion'
export type { RfiQuestionVersionEntity } from '@/lib/typeorm/entities/rfi-question-version'
export type { RfiQuestionVersionRequirementEntity } from '@/lib/typeorm/entities/rfi-question-version-requirement'
export type { RfiQuestionVersionRequirementPackageEntity } from '@/lib/typeorm/entities/rfi-question-version-requirement-package'
export type { RfiQuestionVersionRequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/rfi-question-version-requirement-selection-question'
export type { SpecificationCoAuthorEntity } from '@/lib/typeorm/entities/specification-co-author'
export type { SpecificationGovernanceObjectTypeEntity } from '@/lib/typeorm/entities/specification-governance-object-type'
export type { SpecificationImplementationTypeEntity } from '@/lib/typeorm/entities/specification-implementation-type'
export type { SpecificationItemStatusEntity } from '@/lib/typeorm/entities/specification-item-status'
export type { SpecificationLifecycleStatusEntity } from '@/lib/typeorm/entities/specification-lifecycle-status'
export type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'
export type { SpecificationLocalRequirementDeviationEntity } from '@/lib/typeorm/entities/specification-local-requirement-deviation'
export type { SpecificationLocalRequirementNormReferenceEntity } from '@/lib/typeorm/entities/specification-local-requirement-norm-reference'
export type { SpecificationNeedsReferenceEntity } from '@/lib/typeorm/entities/specification-needs-reference'
export type { SpecificationRequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/specification-requirement-selection-answer'
export type { SpecificationRfiListEntity } from '@/lib/typeorm/entities/specification-rfi-list'
export type { SpecificationRfiQuestionItemEntity } from '@/lib/typeorm/entities/specification-rfi-question-item'
export {
  type AiModelVerificationAttemptEntity,
  aiModelVerificationAttemptEntity,
} from './ai-model-verification-attempt'
export {
  accessReviewItemEntity,
  accessReviewRunEntity,
  actionAuditEventEntity,
  aiConnectionAttestationEntity,
  aiConnectionEntity,
  aiConnectionModelEntity,
  aiConnectionModelOperationalStateEntity,
  aiConnectionModelRevisionEntity,
  aiConnectionModelVerificationEvidenceEntity,
  aiConnectionVerificationEvidenceEntity,
  aiForensicCaptureWindowEntity,
  aiForensicEvidenceEventEntity,
  aiRunProfileEntity,
  aiSafetyRuleEntity,
  aiSafetyRuleTermEntity,
  aiSettingEntity,
  applicationSettingEntity,
  archivingRetentionExceptionEntity,
  archivingRetentionPolicyEntity,
  archivingRetentionRunEntity,
  deviationEntity,
  hsaIdPrefixEntity,
  hsaVerificationQuotaBucketEntity,
  improvementSuggestionEntity,
  normReferenceEntity,
  priorityLevelEntity,
  qualityCharacteristicEntity,
  requirementAreaCoAuthorEntity,
  requirementAreaEntity,
  requirementCategoryEntity,
  requirementEntity,
  requirementImportValidationRateBucketEntity,
  requirementImportValidationSessionEntity,
  requirementListColumnDefaultEntity,
  requirementPackageCoAuthorEntity,
  requirementPackageEntity,
  requirementResponsibilityPersonEntity,
  requirementSelectionAnswerEntity,
  requirementSelectionAnswerPackageEntity,
  requirementSelectionAnswerRequirementEntity,
  requirementSelectionQuestionEntity,
  requirementSelectionQuestionSequenceEntity,
  requirementSelectionQuestionVisibilityConditionEntity,
  requirementSelectionQuestionVisibilityGroupEntity,
  requirementStatusEntity,
  requirementStatusTransitionEntity,
  requirementsSpecificationEntity,
  requirementsSpecificationItemEntity,
  requirementTypeEntity,
  requirementVersionEntity,
  requirementVersionNormReferenceEntity,
  requirementVersionRequirementPackageEntity,
  rfiQuestionEntity,
  rfiQuestionSequenceEntity,
  rfiQuestionSuggestionEntity,
  rfiQuestionVersionEntity,
  rfiQuestionVersionRequirementEntity,
  rfiQuestionVersionRequirementPackageEntity,
  rfiQuestionVersionRequirementSelectionQuestionEntity,
  specificationCoAuthorEntity,
  specificationGovernanceObjectTypeEntity,
  specificationImplementationTypeEntity,
  specificationItemStatusEntity,
  specificationLifecycleStatusEntity,
  specificationLocalRequirementDeviationEntity,
  specificationLocalRequirementEntity,
  specificationLocalRequirementNormReferenceEntity,
  specificationNeedsReferenceEntity,
  specificationRequirementSelectionAnswerEntity,
  specificationRfiListEntity,
  specificationRfiQuestionItemEntity,
}
