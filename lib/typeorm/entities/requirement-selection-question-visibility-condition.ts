import { EntitySchema } from 'typeorm'
import type { RequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'
import type { RequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'
import type { RequirementSelectionQuestionVisibilityGroupEntity } from '@/lib/typeorm/entities/requirement-selection-question-visibility-group'

export interface RequirementSelectionQuestionVisibilityConditionEntity {
  answer: RequirementSelectionAnswerEntity
  answerId: number
  createdAt: Date
  group: RequirementSelectionQuestionVisibilityGroupEntity
  groupId: number
  id: number
  parentQuestion: RequirementSelectionQuestionEntity
  parentQuestionId: number
  sortOrder: number
  updatedAt: Date
}

export const requirementSelectionQuestionVisibilityConditionEntity =
  new EntitySchema<RequirementSelectionQuestionVisibilityConditionEntity>({
    name: 'RequirementSelectionQuestionVisibilityCondition',
    tableName: 'requirement_selection_question_visibility_conditions',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      groupId: {
        name: 'visibility_group_id',
        type: 'int',
      },
      parentQuestionId: {
        name: 'parent_question_id',
        type: 'int',
      },
      answerId: {
        name: 'answer_id',
        type: 'int',
      },
      sortOrder: { default: 0, name: 'sort_order', type: 'int' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    uniques: [
      {
        columns: ['groupId', 'parentQuestionId', 'answerId'],
        name: 'uq_requirement_selection_question_visibility_conditions_answer',
      },
    ],
    indices: [
      {
        columns: ['groupId', 'sortOrder'],
        name: 'idx_requirement_selection_question_visibility_conditions_group_id',
      },
      {
        columns: ['parentQuestionId'],
        name: 'idx_requirement_selection_question_visibility_conditions_parent_question_id',
      },
      {
        columns: ['answerId'],
        name: 'idx_requirement_selection_question_visibility_conditions_answer_id',
      },
    ],
    relations: {
      group: {
        type: 'many-to-one',
        target: 'RequirementSelectionQuestionVisibilityGroup',
        joinColumn: {
          name: 'visibility_group_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_question_visibility_conditions_visibility_group_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      parentQuestion: {
        type: 'many-to-one',
        target: 'RequirementSelectionQuestion',
        joinColumn: {
          name: 'parent_question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_question_visibility_conditions_parent_question_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      answer: {
        type: 'many-to-one',
        target: 'RequirementSelectionAnswer',
        joinColumn: {
          name: 'answer_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_question_visibility_conditions_answer_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
