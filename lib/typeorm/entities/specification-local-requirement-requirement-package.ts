import { EntitySchema } from 'typeorm'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import type { SpecificationLocalRequirementEntity } from '@/lib/typeorm/entities/specification-local-requirement'

export interface SpecificationLocalRequirementRequirementPackageEntity {
  requirementPackage: RequirementPackageEntity
  requirementPackageId: number
  specificationLocalRequirement: SpecificationLocalRequirementEntity
  specificationLocalRequirementId: number
}

export const specificationLocalRequirementRequirementPackageEntity =
  new EntitySchema<SpecificationLocalRequirementRequirementPackageEntity>({
    name: 'SpecificationLocalRequirementRequirementPackage',
    tableName: 'specification_local_requirement_requirement_packages',
    columns: {
      specificationLocalRequirementId: {
        name: 'specification_local_requirement_id',
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
        name: 'idx_specification_local_requirement_requirement_packages_requirement_package_id',
        columns: ['requirementPackageId'],
      },
    ],
    relations: {
      specificationLocalRequirement: {
        type: 'many-to-one',
        target: 'SpecificationLocalRequirement',
        joinColumn: {
          name: 'specification_local_requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_local_requirement_requirement_packages_specification_local_requirement_id',
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
            'fk_specification_local_requirement_requirement_packages_requirement_package_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
