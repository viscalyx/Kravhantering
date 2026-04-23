import { EntitySchema } from 'typeorm'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'

export interface PackageNeedsReferenceEntity {
  createdAt: Date
  id: number
  package: RequirementPackageEntity
  packageId: number
  text: string
}

export const packageNeedsReferenceEntity =
  new EntitySchema<PackageNeedsReferenceEntity>({
    name: 'PackageNeedsReference',
    tableName: 'package_needs_references',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      packageId: { name: 'package_id', type: 'int' },
      text: { name: 'text', type: 'nvarchar', length: 450 },
      createdAt: { name: 'created_at', type: 'datetime2' },
    },
    uniques: [
      {
        name: 'uq_package_needs_references_package_id_id',
        columns: ['packageId', 'id'],
      },
      {
        name: 'uq_package_needs_references_package_text',
        columns: ['packageId', 'text'],
      },
    ],
    relations: {
      package: {
        type: 'many-to-one',
        target: 'RequirementPackage',
        joinColumn: {
          name: 'package_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_package_needs_references_package_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
      },
    },
  })
