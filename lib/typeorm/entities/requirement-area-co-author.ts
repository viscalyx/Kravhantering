import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'
import type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'

export interface RequirementAreaCoAuthorEntity {
  area: RequirementAreaEntity
  areaId: number
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  hsaId: string
  person: RequirementResponsibilityPersonEntity
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
        length: 31,
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
      person: {
        type: 'many-to-one',
        target: 'RequirementResponsibilityPerson',
        joinColumn: {
          name: 'hsa_id',
          referencedColumnName: 'hsaId',
          foreignKeyConstraintName: 'fk_requirement_area_co_authors_hsa_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
