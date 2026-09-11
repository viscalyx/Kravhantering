import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from './requirements-specification'
import type { RfiQuestionVersionEntity } from './rfi-question-version'

export interface SpecificationRfiAssessmentEntity {
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  documentReference: string | null
  documentUrl: string | null
  id: number
  reason: string | null
  relevance: 'relevant' | 'not_relevant' | null
  specification: RequirementsSpecificationEntity
  version: RfiQuestionVersionEntity
}

export const specificationRfiAssessmentEntity =
  new EntitySchema<SpecificationRfiAssessmentEntity>({
    name: 'SpecificationRfiAssessment',
    tableName: 'specification_rfi_assessments',
    columns: {
      id: { name: 'id', type: 'int', primary: true, generated: 'increment' },
      relevance: {
        name: 'relevance',
        type: 'nvarchar',
        length: 16,
        nullable: true,
      },
      reason: {
        name: 'reason',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      documentReference: {
        name: 'document_reference',
        type: 'nvarchar',
        length: 2000,
        nullable: true,
      },
      documentUrl: {
        name: 'document_url',
        type: 'nvarchar',
        length: 2000,
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      createdByHsaId: {
        name: 'created_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      createdByDisplayName: {
        name: 'created_by_display_name',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
    },
    checks: [
      {
        name: 'chk_specification_rfi_assessments_relevance',
        expression:
          "[relevance] IS NULL OR [relevance] IN (N'relevant', N'not_relevant')",
      },
    ],
    indices: [
      {
        name: 'idx_specification_rfi_assessments_specification_id',
        columns: ['specification', 'id'],
      },
      {
        name: 'idx_specification_rfi_assessments_rfi_question_version_id',
        columns: ['version'],
      },
      {
        name: 'idx_specification_rfi_assessments_created_by_hsa_id',
        columns: ['createdByHsaId'],
      },
    ],
    relations: {
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        nullable: false,
        joinColumn: {
          name: 'specification_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_rfi_assessments_specification_id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      version: {
        type: 'many-to-one',
        target: 'RfiQuestionVersion',
        nullable: false,
        joinColumn: {
          name: 'rfi_question_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_rfi_assessments_rfi_question_version_id',
        },
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
