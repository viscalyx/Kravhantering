import { EntitySchema } from 'typeorm'
import type { RequirementsSpecificationEntity } from '@/lib/typeorm/entities/requirements-specification'

export interface SpecificationCoAuthorEntity {
  canGenerateAi: boolean
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  displayName: string
  hsaId: string
  specification: RequirementsSpecificationEntity
  specificationId: number
}

export const specificationCoAuthorEntity =
  new EntitySchema<SpecificationCoAuthorEntity>({
    name: 'SpecificationCoAuthor',
    tableName: 'specification_co_authors',
    columns: {
      specificationId: {
        name: 'specification_id',
        primary: true,
        type: 'int',
      },
      hsaId: {
        name: 'hsa_id',
        primary: true,
        type: 'nvarchar',
        length: 64,
      },
      displayName: {
        name: 'display_name',
        type: 'nvarchar',
        length: 'MAX',
      },
      canGenerateAi: {
        name: 'can_generate_ai',
        type: 'bit',
        default: false,
      },
      createdAt: {
        name: 'created_at',
        type: 'datetime2',
      },
      createdByHsaId: {
        name: 'created_by_hsa_id',
        type: 'nvarchar',
        length: 64,
        nullable: true,
      },
      createdByDisplayName: {
        name: 'created_by_display_name',
        type: 'nvarchar',
        length: 'MAX',
        nullable: true,
      },
    },
    indices: [
      {
        name: 'idx_specification_co_authors_hsa_id',
        columns: ['hsaId'],
      },
      {
        name: 'idx_specification_co_authors_created_by_hsa_id',
        columns: ['createdByHsaId'],
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
            'fk_specification_co_authors_specification_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
