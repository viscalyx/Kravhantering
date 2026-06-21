import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { RfiQuestionEntity } from '@/lib/typeorm/entities/rfi-question'
import type { RfiQuestionVersionEntity } from '@/lib/typeorm/entities/rfi-question-version'

export type SpecificationRfiQuestionRelevance = 'not_relevant' | 'relevant'

export interface SpecificationRfiQuestionItemEntity {
  changedAt: Date
  changedByDisplayName: string | null
  changedByHsaId: string | null
  isIncluded: boolean
  question: RfiQuestionEntity
  relevance: SpecificationRfiQuestionRelevance | null
  rfiQuestionId: number
  rfiQuestionVersionId: number | null
  specification: RequirementsSpecificationEntity
  specificationId: number
  version: RfiQuestionVersionEntity | null
}

export const specificationRfiQuestionItemEntity =
  new EntitySchema<SpecificationRfiQuestionItemEntity>({
    name: 'SpecificationRfiQuestionItem',
    tableName: 'specification_rfi_question_items',
    columns: {
      specificationId: {
        name: 'specification_id',
        primary: true,
        type: 'int',
      },
      rfiQuestionId: {
        name: 'rfi_question_id',
        primary: true,
        type: 'int',
      },
      rfiQuestionVersionId: {
        name: 'rfi_question_version_id',
        nullable: true,
        type: 'int',
      },
      isIncluded: { default: true, name: 'is_included', type: 'bit' },
      relevance: {
        length: 16,
        name: 'relevance',
        nullable: true,
        type: 'nvarchar',
      },
      changedAt: { name: 'changed_at', type: 'datetime2' },
      changedByHsaId: {
        length: 64,
        name: 'changed_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      changedByDisplayName: {
        length: 'MAX',
        name: 'changed_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
    },
    checks: [
      {
        expression:
          "[relevance] IS NULL OR [relevance] IN (N'relevant', N'not_relevant')",
        name: 'chk_specification_rfi_question_items_relevance',
      },
    ],
    indices: [
      {
        columns: ['rfiQuestionVersionId'],
        name: 'idx_specification_rfi_question_items_version_id',
      },
      {
        columns: ['changedByHsaId'],
        name: 'idx_specification_rfi_question_items_changed_by_hsa_id',
      },
    ],
    relations: {
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        joinColumn: {
          name: 'specification_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_rfi_question_items_specification_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      question: {
        type: 'many-to-one',
        target: 'RfiQuestion',
        joinColumn: {
          name: 'rfi_question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_rfi_question_items_rfi_question_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      version: {
        type: 'many-to-one',
        target: 'RfiQuestionVersion',
        joinColumn: {
          name: 'rfi_question_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_rfi_question_items_rfi_question_version_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
