import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'
import type { RfiQuestionEntity } from '@/lib/typeorm/entities/rfi-question'

export interface RfiQuestionSuggestionEntity {
  area: RequirementAreaEntity
  areaId: number
  content: string
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  id: number
  isReviewRequested: boolean
  question: RfiQuestionEntity | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: Date | null
  resolvedByDisplayName: string | null
  resolvedByHsaId: string | null
  reviewRequestedAt: Date | null
  rfiQuestionId: number | null
  sourceSpecificationName: string | null
  sourceSpecificationUniqueId: string | null
  specification: RequirementsSpecificationEntity | null
  specificationId: number | null
  updatedAt: Date | null
}

export const rfiQuestionSuggestionEntity =
  new EntitySchema<RfiQuestionSuggestionEntity>({
    name: 'RfiQuestionSuggestion',
    tableName: 'rfi_question_suggestions',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      areaId: { name: 'area_id', type: 'int' },
      rfiQuestionId: { name: 'rfi_question_id', nullable: true, type: 'int' },
      specificationId: {
        name: 'specification_id',
        nullable: true,
        type: 'int',
      },
      sourceSpecificationUniqueId: {
        length: 450,
        name: 'source_specification_unique_id',
        nullable: true,
        type: 'nvarchar',
      },
      sourceSpecificationName: {
        length: 'MAX',
        name: 'source_specification_name',
        nullable: true,
        type: 'nvarchar',
      },
      content: { length: 'MAX', name: 'content', type: 'nvarchar' },
      isReviewRequested: {
        default: false,
        name: 'is_review_requested',
        type: 'bit',
      },
      reviewRequestedAt: {
        name: 'review_requested_at',
        nullable: true,
        type: 'datetime2',
      },
      resolution: { name: 'resolution', nullable: true, type: 'int' },
      resolutionMotivation: {
        length: 'MAX',
        name: 'resolution_motivation',
        nullable: true,
        type: 'nvarchar',
      },
      createdByHsaId: {
        length: 64,
        name: 'created_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      createdByDisplayName: {
        length: 'MAX',
        name: 'created_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', nullable: true, type: 'datetime2' },
      resolvedByHsaId: {
        length: 64,
        name: 'resolved_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      resolvedByDisplayName: {
        length: 'MAX',
        name: 'resolved_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      resolvedAt: { name: 'resolved_at', nullable: true, type: 'datetime2' },
    },
    checks: [
      {
        expression: '[resolution] IS NULL OR [resolution] IN (1, 2)',
        name: 'chk_rfi_question_suggestions_resolution',
      },
    ],
    indices: [
      { columns: ['areaId'], name: 'idx_rfi_question_suggestions_area_id' },
      {
        columns: ['rfiQuestionId'],
        name: 'idx_rfi_question_suggestions_rfi_question_id',
      },
      {
        columns: ['specificationId'],
        name: 'idx_rfi_question_suggestions_specification_id',
      },
      {
        columns: ['createdByHsaId'],
        name: 'idx_rfi_question_suggestions_created_by_hsa_id',
      },
      {
        columns: ['resolvedByHsaId'],
        name: 'idx_rfi_question_suggestions_resolved_by_hsa_id',
      },
    ],
    relations: {
      area: {
        type: 'many-to-one',
        target: 'RequirementArea',
        joinColumn: {
          name: 'area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_rfi_question_suggestions_area_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      question: {
        type: 'many-to-one',
        target: 'RfiQuestion',
        joinColumn: {
          name: 'rfi_question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_rfi_question_suggestions_rfi_question_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        joinColumn: {
          name: 'specification_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_rfi_question_suggestions_specification_id',
        },
        nullable: true,
        onDelete: 'SET NULL',
        onUpdate: 'NO ACTION',
      },
    },
  })
