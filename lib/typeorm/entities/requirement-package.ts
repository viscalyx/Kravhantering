import { EntitySchema } from 'typeorm'
import type { PackageImplementationTypeEntity } from '@/lib/typeorm/entities/package-implementation-type'
import type { PackageLifecycleStatusEntity } from '@/lib/typeorm/entities/package-lifecycle-status'
import type { PackageResponsibilityAreaEntity } from '@/lib/typeorm/entities/package-responsibility-area'

export interface RequirementPackageEntity {
  businessNeedsReference: string | null
  createdAt: Date
  id: number
  localRequirementNextSequence: number
  name: string
  packageImplementationType: PackageImplementationTypeEntity | null
  packageLifecycleStatus: PackageLifecycleStatusEntity | null
  packageResponsibilityArea: PackageResponsibilityAreaEntity | null
  uniqueId: string
  updatedAt: Date
}

export const requirementPackageEntity =
  new EntitySchema<RequirementPackageEntity>({
    name: 'RequirementPackage',
    tableName: 'requirement_packages',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
      businessNeedsReference: {
        name: 'business_needs_reference',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      uniqueId: {
        name: 'unique_id',
        type: 'nvarchar',
        length: 450,
        default: '',
      },
      name: {
        name: 'name',
        type: 'nvarchar',
        length: 'MAX',
        default: '',
      },
      localRequirementNextSequence: {
        name: 'local_requirement_next_sequence',
        type: 'int',
        default: 1,
      },
    },
    uniques: [
      { name: 'uq_requirement_packages_unique_id', columns: ['uniqueId'] },
    ],
    relations: {
      packageResponsibilityArea: {
        type: 'many-to-one',
        target: 'PackageResponsibilityArea',
        joinColumn: {
          name: 'package_responsibility_area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_packages_package_responsibility_area_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      packageImplementationType: {
        type: 'many-to-one',
        target: 'PackageImplementationType',
        joinColumn: {
          name: 'package_implementation_type_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_packages_package_implementation_type_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
      packageLifecycleStatus: {
        type: 'many-to-one',
        target: 'PackageLifecycleStatus',
        joinColumn: {
          name: 'package_lifecycle_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_packages_package_lifecycle_status_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
      },
    },
  })
