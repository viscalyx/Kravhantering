import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'

export interface RequirementAreaCoAuthorEntity {
  area: RequirementAreaEntity
  areaId: number
  canGenerateAi: boolean
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  displayName: string
  hsaId: string
}

export const requirementAreaCoAuthorEntity =
  new EntitySchema<RequirementAreaCoAuthorEntity>({
    name: 'RequirementAreaCoAuthor',
    tableName: 'requirement_area_co_authors',
    columns: {
      areaId: {
        name: 'area_id',
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
        name: 'idx_requirement_area_co_authors_hsa_id',
        columns: ['hsaId'],
      },
      {
        name: 'idx_requirement_area_co_authors_created_by_hsa_id',
        columns: ['createdByHsaId'],
      },
    ],
    relations: {
      area: {
        type: 'many-to-one',
        target: 'RequirementArea',
        joinColumn: {
          name: 'area_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName: 'fk_requirement_area_co_authors_area_id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      },
    },
  })
