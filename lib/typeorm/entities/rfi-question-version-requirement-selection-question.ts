import { EntitySchema } from 'typeorm'

export interface RfiQuestionVersionRequirementSelectionQuestionEntity {
  requirementSelectionQuestion?: unknown
  requirementSelectionQuestionId: number
  rfiQuestionVersion?: unknown
  rfiQuestionVersionId: number
}

export const rfiQuestionVersionRequirementSelectionQuestionEntity =
  new EntitySchema<RfiQuestionVersionRequirementSelectionQuestionEntity>({
    name: 'RfiQuestionVersionRequirementSelectionQuestion',
    tableName: 'rfi_question_version_requirement_selection_questions',
    columns: {
      rfiQuestionVersionId: {
        name: 'rfi_question_version_id',
        primary: true,
        type: 'int',
      },
      requirementSelectionQuestionId: {
        name: 'requirement_selection_question_id',
        primary: true,
        type: 'int',
      },
    },
    indices: [
      {
        columns: ['requirementSelectionQuestionId'],
        name: 'idx_rfi_question_version_requirement_selection_questions_question_id',
      },
    ],
    relations: {
      rfiQuestionVersion: {
        type: 'many-to-one',
        target: 'RfiQuestionVersion',
        joinColumn: {
          name: 'rfi_question_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_rfi_question_version_requirement_selection_questions_rfi_question_version_id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      requirementSelectionQuestion: {
        type: 'many-to-one',
        target: 'RequirementSelectionQuestion',
        joinColumn: {
          name: 'requirement_selection_question_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_rfi_question_version_requirement_selection_questions_requirement_selection_question_id',
        },
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
