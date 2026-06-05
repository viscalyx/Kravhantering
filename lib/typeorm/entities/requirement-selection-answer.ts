import { EntitySchema } from 'typeorm'
import type { RequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'

export interface RequirementSelectionAnswerEntity {
  answerText: string
  archivedAt: Date | null
  createdAt: Date
  description: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  question: RequirementSelectionQuestionEntity
  questionId: number
  sortOrder: number
  updatedAt: Date
}

export const requirementSelectionAnswerEntity =
  new EntitySchema<RequirementSelectionAnswerEntity>({
    name: 'RequirementSelectionAnswer',
    tableName: 'requirement_selection_answers',
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
      answerText: {
        length: 'MAX',
        name: 'answer_text',
        type: 'nvarchar',
      },
      description: {
        length: 'MAX',
        name: 'description',
        nullable: true,
        type: 'nvarchar',
      },
      sortOrder: { default: 0, name: 'sort_order', type: 'int' },
      isNoRequirementSelection: {
        default: false,
        name: 'is_no_requirement_selection',
        type: 'bit',
      },
      isActive: { default: true, name: 'is_active', type: 'bit' },
      isArchived: { default: false, name: 'is_archived', type: 'bit' },
      archivedAt: { name: 'archived_at', nullable: true, type: 'datetime2' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        columns: ['questionId', 'sortOrder'],
        name: 'idx_requirement_selection_answers_question_sort_order',
      },
      {
        columns: ['isActive', 'isArchived'],
        name: 'idx_requirement_selection_answers_state',
      },
      {
        columns: ['isArchived', 'archivedAt'],
        name: 'idx_requirement_selection_answers_archived_at',
      },
    ],
    checks: [
      {
        expression: 'NOT ([is_active] = 1 AND [is_archived] = 1)',
        name: 'chk_requirement_selection_answers_state',
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
            'fk_requirement_selection_answers_question_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
