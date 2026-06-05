import { EntitySchema } from 'typeorm'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import type { RequirementSelectionAnswerEntity } from '@/lib/typeorm/entities/requirement-selection-answer'

export interface RequirementSelectionAnswerPackageEntity {
  answer: RequirementSelectionAnswerEntity
  answerId: number
  requirementPackage: RequirementPackageEntity
  requirementPackageId: number
}

export const requirementSelectionAnswerPackageEntity =
  new EntitySchema<RequirementSelectionAnswerPackageEntity>({
    name: 'RequirementSelectionAnswerPackage',
    tableName: 'requirement_selection_answer_packages',
    columns: {
      answerId: {
        name: 'answer_id',
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
        name: 'idx_requirement_selection_answer_packages_package_id',
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
            'fk_requirement_selection_answer_packages_answer_id',
        },
        nullable: false,
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
            'fk_requirement_selection_answer_packages_requirement_package_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
