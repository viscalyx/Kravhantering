import { EntitySchema } from 'typeorm'
import type { RequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'
import type { RequirementSelectionQuestionEntity } from '@/lib/typeorm/entities/requirement-selection-question'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'

export interface SpecificationRequirementSelectionAnswerEntity {
  answer: RequirementSelectionAnswerEntity
  answerId: number
  changedAt: Date
  changedByDisplayName: string | null
  changedByHsaId: string | null
  isHistorical: boolean
  question: RequirementSelectionQuestionEntity
  questionId: number
  specification: RequirementsSpecificationEntity
  specificationId: number
}

export const specificationRequirementSelectionAnswerEntity =
  new EntitySchema<SpecificationRequirementSelectionAnswerEntity>({
    name: 'SpecificationRequirementSelectionAnswer',
    tableName: 'specification_requirement_selection_answers',
    columns: {
      specificationId: {
        name: 'specification_id',
        primary: true,
        type: 'int',
      },
      questionId: {
        name: 'question_id',
        primary: true,
        type: 'int',
      },
      answerId: {
        name: 'answer_id',
        primary: true,
        type: 'int',
      },
      isHistorical: {
        default: false,
        name: 'is_historical',
        type: 'bit',
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
    indices: [
      {
        columns: ['specificationId', 'isHistorical'],
        name: 'idx_specification_requirement_selection_answers_historical',
      },
      {
        columns: ['changedByHsaId'],
        name: 'idx_specification_requirement_selection_answers_changed_by_hsa_id',
      },
      {
        columns: ['answerId'],
        name: 'idx_specification_requirement_selection_answers_answer_id',
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
            'fk_specification_requirement_selection_answers_specification_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      question: {
        type: 'many-to-one',
        target: 'RequirementSelectionQuestion',
        joinColumn: {
          name: 'question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_requirement_selection_answers_question_id',
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
            'fk_specification_requirement_selection_answers_answer_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
