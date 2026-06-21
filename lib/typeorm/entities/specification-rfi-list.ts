import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'

export interface SpecificationRfiListEntity {
  createdAt: Date
  isLocked: boolean
  lockedAt: Date | null
  lockedByDisplayName: string | null
  lockedByHsaId: string | null
  specification: RequirementsSpecificationEntity
  specificationId: number
  updatedAt: Date
}

export const specificationRfiListEntity =
  new EntitySchema<SpecificationRfiListEntity>({
    name: 'SpecificationRfiList',
    tableName: 'specification_rfi_lists',
    columns: {
      specificationId: {
        name: 'specification_id',
        primary: true,
        type: 'int',
      },
      isLocked: { default: false, name: 'is_locked', type: 'bit' },
      lockedAt: { name: 'locked_at', nullable: true, type: 'datetime2' },
      lockedByHsaId: {
        length: 64,
        name: 'locked_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      lockedByDisplayName: {
        length: 'MAX',
        name: 'locked_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        columns: ['lockedByHsaId'],
        name: 'idx_specification_rfi_lists_locked_by_hsa_id',
      },
    ],
    relations: {
      specification: {
        type: 'many-to-one',
        target: 'RequirementsSpecification',
        joinColumn: {
          name: 'specification_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_specification_rfi_lists_specification_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
