import { EntitySchema } from 'typeorm'
import type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'

export interface ImprovementSuggestionEntity {
  content: string
  createdAt: Date
  createdBy: string | null
  id: number
  isReviewRequested: boolean
  requirement: RequirementEntity
  requirementVersion: RequirementVersionEntity | null
  resolution: number | null
  resolutionMotivation: string | null
  resolvedAt: Date | null
  resolvedBy: string | null
  reviewRequestedAt: Date | null
  updatedAt: Date | null
}

export const improvementSuggestionEntity =
  new EntitySchema<ImprovementSuggestionEntity>({
    name: 'ImprovementSuggestion',
    tableName: 'improvement_suggestions',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      content: { name: 'content', type: 'nvarchar', length: 'MAX' },
      isReviewRequested: {
        name: 'is_review_requested',
        type: 'bit',
        default: false,
      },
      resolution: { name: 'resolution', type: 'int', nullable: true },
      resolutionMotivation: {
        name: 'resolution_motivation',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      resolvedBy: {
        name: 'resolved_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      resolvedAt: { name: 'resolved_at', type: 'datetime2', nullable: true },
      createdBy: {
        name: 'created_by',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2', nullable: true },
      reviewRequestedAt: {
        name: 'review_requested_at',
        type: 'datetime2',
        nullable: true,
      },
    },
    indices: [
      {
        name: 'idx_improvement_suggestions_requirement_id',
        columns: ['requirement'],
      },
      {
        name: 'idx_improvement_suggestions_requirement_version_id',
        columns: ['requirementVersion'],
      },
    ],
    relations: {
      requirement: {
        type: 'many-to-one',
        target: 'Requirement',
        joinColumn: {
          name: 'requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_improvement_suggestions_requirement_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
      },
      requirementVersion: {
        type: 'many-to-one',
        target: 'RequirementVersion',
        joinColumn: {
          name: 'requirement_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_improvement_suggestions_requirement_version_id',
        },
        nullable: true,
        onDelete: 'SET NULL',
      },
    },
  })
