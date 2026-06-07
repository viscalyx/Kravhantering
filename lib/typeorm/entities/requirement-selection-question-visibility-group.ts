import { EntitySchema } from 'typeorm'
import type { RequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'

export interface RequirementSelectionQuestionVisibilityGroupEntity {
  createdAt: Date
  id: number
  question: RequirementSelectionQuestionEntity
  questionId: number
  sortOrder: number
  updatedAt: Date
}

export const requirementSelectionQuestionVisibilityGroupEntity =
  new EntitySchema<RequirementSelectionQuestionVisibilityGroupEntity>({
    name: 'RequirementSelectionQuestionVisibilityGroup',
    tableName: 'requirement_selection_question_visibility_groups',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      questionId: {
        name: 'question_id',
        type: 'int',
      },
      sortOrder: { default: 0, name: 'sort_order', type: 'int' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        columns: ['questionId', 'sortOrder'],
        name: 'idx_requirement_selection_question_visibility_groups_question_id',
      },
    ],
    relations: {
      question: {
        type: 'many-to-one',
        target: 'RequirementSelectionQuestion',
        joinColumn: {
          name: 'question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_question_visibility_groups_question_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
