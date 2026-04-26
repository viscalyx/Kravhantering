import { EntitySchema } from 'typeorm'
import type { PackageItemStatusEntity } from '@/lib/typeorm/entities/package-item-status'
import type { PackageNeedsReferenceEntity } from '@/lib/typeorm/entities/package-needs-reference'
import type { RequirementEntity } from '@/lib/typeorm/entities/requirement'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import type { RequirementVersionEntity } from '@/lib/typeorm/entities/requirement-version'

export interface RequirementPackageItemEntity {
  createdAt: Date
  id: number
  needsReference: PackageNeedsReferenceEntity | null
  note: string | null
  packageItemStatus: PackageItemStatusEntity | null
  requirement: RequirementEntity
  requirementPackage: RequirementPackageEntity
  requirementVersion: RequirementVersionEntity
  statusUpdatedAt: Date | null
  unused1: string | null
}

export const requirementPackageItemEntity =
  new EntitySchema<RequirementPackageItemEntity>({
    name: 'RequirementPackageItem',
    tableName: 'requirement_package_items',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      unused1: {
        name: 'unused_1',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      note: {
        name: 'note',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
      statusUpdatedAt: {
        name: 'status_updated_at',
        type: 'datetime2',
        nullable: true,
      },
    },
    uniques: [
      {
        name: 'uq_requirement_package_items_package_requirement',
        columns: ['requirementPackage', 'requirement'],
      },
    ],
    indices: [
      {
        name: 'idx_requirement_package_items_package_item_status_id',
        columns: ['packageItemStatus'],
      },
      {
        name: 'idx_requirement_package_items_requirement_id',
        columns: ['requirement'],
      },
      {
        name: 'idx_requirement_package_items_requirement_package_id',
        columns: ['requirementPackage'],
      },
    ],
    relations: {
      requirementPackage: {
        type: 'many-to-one',
        target: 'RequirementPackage',
        joinColumn: {
          name: 'requirement_package_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_package_items_requirement_package_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirement: {
        type: 'many-to-one',
        target: 'Requirement',
        joinColumn: {
          name: 'requirement_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_package_items_requirement_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      requirementVersion: {
        type: 'many-to-one',
        target: 'RequirementVersion',
        joinColumn: {
          name: 'requirement_version_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_package_items_requirement_version_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      needsReference: {
        type: 'many-to-one',
        target: 'PackageNeedsReference',
        joinColumn: [
          {
            name: 'requirement_package_id',
            referencedColumnName: 'packageId',
            foreignKeyConstraintName:
              'fk_requirement_package_items_requirement_package_id_needs_reference_id',
          },
          {
            name: 'needs_reference_id',
            referencedColumnName: 'id',
          },
        ],
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
      packageItemStatus: {
        type: 'many-to-one',
        target: 'PackageItemStatus',
        joinColumn: {
          name: 'package_item_status_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_requirement_package_items_package_item_status_id',
        },
        nullable: true,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
