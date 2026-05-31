import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'

export type RequirementSelectionQuestionType = 'multiple' | 'single'

export interface RequirementSelectionQuestionEntity {
  area: RequirementAreaEntity
  areaId: number
  createdAt: Date
  helpText: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  questionCode: string
  questionText: string
  selectionType: RequirementSelectionQuestionType
  sortOrder: number
  updatedAt: Date
}

export const requirementSelectionQuestionEntity =
  new EntitySchema<RequirementSelectionQuestionEntity>({
    name: 'RequirementSelectionQuestion',
    tableName: 'requirement_selection_questions',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      areaId: {
        name: 'area_id',
        type: 'int',
      },
      questionCode: {
        length: 64,
        name: 'question_code',
        type: 'nvarchar',
      },
      questionText: {
        length: 'MAX',
        name: 'question_text',
        type: 'nvarchar',
      },
      helpText: {
        length: 'MAX',
        name: 'help_text',
        nullable: true,
        type: 'nvarchar',
      },
      selectionType: {
        length: 16,
        name: 'selection_type',
        type: 'nvarchar',
      },
      sortOrder: { default: 0, name: 'sort_order', type: 'int' },
      isActive: { default: false, name: 'is_active', type: 'bit' },
      isArchived: { default: false, name: 'is_archived', type: 'bit' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    uniques: [
      {
        columns: ['questionCode'],
        name: 'uq_requirement_selection_questions_question_code',
      },
    ],
    indices: [
      {
        columns: ['areaId', 'sortOrder'],
        name: 'idx_requirement_selection_questions_area_sort_order',
      },
      {
        columns: ['isActive', 'isArchived'],
        name: 'idx_requirement_selection_questions_state',
      },
    ],
    checks: [
      {
        expression: "[selection_type] IN (N'single', N'multiple')",
        name: 'chk_requirement_selection_questions_selection_type',
      },
      {
        expression: 'NOT ([is_active] = 1 AND [is_archived] = 1)',
        name: 'chk_requirement_selection_questions_state',
      },
    ],
    relations: {
      area: {
        type: 'many-to-one',
        target: 'RequirementArea',
        joinColumn: {
          name: 'area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_selection_questions_area_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
