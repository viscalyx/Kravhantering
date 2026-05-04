import { EntitySchema } from 'typeorm'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'

export interface RequirementVersionRequirementPackageEntity {
  requirementPackage: RequirementPackageEntity
  requirementPackageId: number
  requirementVersion: RequirementVersionEntity
  requirementVersionId: number
}

export const requirementVersionRequirementPackageEntity =
  new EntitySchema<RequirementVersionRequirementPackageEntity>({
    name: 'RequirementVersionRequirementPackage',
    tableName: 'requirement_version_requirement_packages',
    columns: {
      requirementVersionId: {
        name: 'requirement_version_id',
        type: 'int',
        primary: true,
      },
      requirementPackageId: {
        name: 'requirement_package_id',
        type: 'int',
        primary: true,
      },
    },
    indices: [
      {
        name: 'idx_requirement_version_requirement_packages_requirement_package_id',
        columns: ['requirementPackageId'],
      },
    ],
    relations: {
      requirementVersion: {
        type: 'many-to-one',
        target: 'RequirementVersion',
        joinColumn: {
          name: 'requirement_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_version_requirement_packages_requirement_version_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirementPackage: {
        type: 'many-to-one',
        target: 'RequirementPackage',
        joinColumn: {
          name: 'requirement_package_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_version_requirement_packages_requirement_package_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
