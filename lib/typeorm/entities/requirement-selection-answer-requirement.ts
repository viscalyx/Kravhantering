import { EntitySchema } from 'typeorm'
import type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
import type { RequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'

export interface RequirementSelectionAnswerRequirementEntity {
  answer: RequirementSelectionAnswerEntity
  answerId: number
  requirement: RequirementEntity
  requirementId: number
}

export const requirementSelectionAnswerRequirementEntity =
  new EntitySchema<RequirementSelectionAnswerRequirementEntity>({
    name: 'RequirementSelectionAnswerRequirement',
    tableName: 'requirement_selection_answer_requirements',
    columns: {
      answerId: {
        name: 'answer_id',
        primary: true,
        type: 'int',
      },
      requirementId: {
        name: 'requirement_id',
        primary: true,
        type: 'int',
      },
    },
    indices: [
      {
        columns: ['requirementId'],
        name: 'idx_requirement_selection_answer_requirements_requirement_id',
      },
    ],
    relations: {
      answer: {
        type: 'many-to-one',
        target: 'RequirementSelectionAnswer',
        joinColumn: {
          name: 'answer_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_answer_requirements_answer_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      requirement: {
        type: 'many-to-one',
        target: 'Requirement',
        joinColumn: {
          name: 'requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_answer_requirements_requirement_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
