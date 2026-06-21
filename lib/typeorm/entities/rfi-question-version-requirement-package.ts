import { EntitySchema } from 'typeorm'

export interface RfiQuestionVersionRequirementPackageEntity {
  requirementPackage?: unknown
  requirementPackageId: number
  rfiQuestionVersion?: unknown
  rfiQuestionVersionId: number
}

export const rfiQuestionVersionRequirementPackageEntity =
  new EntitySchema<RfiQuestionVersionRequirementPackageEntity>({
    name: 'RfiQuestionVersionRequirementPackage',
    tableName: 'rfi_question_version_requirement_packages',
    columns: {
      rfiQuestionVersionId: {
        name: 'rfi_question_version_id',
        primary: true,
        type: 'int',
      },
      requirementPackageId: {
        name: 'requirement_package_id',
        primary: true,
        type: 'int',
      },
    },
    indices: [
      {
        columns: ['requirementPackageId'],
        name: 'idx_rfi_question_version_requirement_packages_package_id',
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
            'fk_rfi_question_version_requirement_packages_rfi_question_version_id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      requirementPackage: {
        type: 'many-to-one',
        target: 'RequirementPackage',
        joinColumn: {
          name: 'requirement_package_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_rfi_question_version_requirement_packages_requirement_package_id',
        },
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
