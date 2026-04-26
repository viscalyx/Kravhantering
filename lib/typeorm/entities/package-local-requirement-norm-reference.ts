import { EntitySchema } from 'typeorm'
import type { NormReferenceEntity } from '@/lib/typeorm/entities/norm-reference'
import type { PackageLocalRequirementEntity } from '@/lib/typeorm/entities/package-local-requirement'

export interface PackageLocalRequirementNormReferenceEntity {
  normReference: NormReferenceEntity
  normReferenceId: number
  packageLocalRequirement: PackageLocalRequirementEntity
  packageLocalRequirementId: number
}

export const packageLocalRequirementNormReferenceEntity =
  new EntitySchema<PackageLocalRequirementNormReferenceEntity>({
    name: 'PackageLocalRequirementNormReference',
    tableName: 'package_local_requirement_norm_references',
    columns: {
      packageLocalRequirementId: {
        name: 'package_local_requirement_id',
        type: 'int',
        primary: true,
      },
      normReferenceId: {
        name: 'norm_reference_id',
        type: 'int',
        primary: true,
      },
    },
    indices: [
      {
        name: 'idx_package_local_requirement_norm_references_norm_reference_id',
        columns: ['normReferenceId'],
      },
    ],
    relations: {
      packageLocalRequirement: {
        type: 'many-to-one',
        target: 'PackageLocalRequirement',
        joinColumn: {
          name: 'package_local_requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirement_norm_references_package_local_requirement_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
      normReference: {
        type: 'many-to-one',
        target: 'NormReference',
        joinColumn: {
          name: 'norm_reference_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_package_local_requirement_norm_references_norm_reference_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
