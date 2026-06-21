import { EntitySchema } from 'typeorm'

export interface RfiQuestionVersionRequirementEntity {
  requirement?: unknown
  requirementId: number
  rfiQuestionVersion?: unknown
  rfiQuestionVersionId: number
}

export const rfiQuestionVersionRequirementEntity =
  new EntitySchema<RfiQuestionVersionRequirementEntity>({
    name: 'RfiQuestionVersionRequirement',
    tableName: 'rfi_question_version_requirements',
    columns: {
      rfiQuestionVersionId: {
        name: 'rfi_question_version_id',
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
        name: 'idx_rfi_question_version_requirements_requirement_id',
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
            'fk_rfi_question_version_requirements_rfi_question_version_id',
        },
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
            'fk_rfi_question_version_requirements_requirement_id',
        },
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
