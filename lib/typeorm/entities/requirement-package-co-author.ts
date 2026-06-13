import { EntitySchema } from 'typeorm'
import type { RequirementPackageEntity } from '@/lib/typeorm/entities/requirement-package'
import type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'

export interface RequirementPackageCoAuthorEntity {
  createdAt: Date
  createdByDisplayName: string | null
  createdByHsaId: string | null
  hsaId: string
  person: RequirementResponsibilityPersonEntity
  requirementPackage: RequirementPackageEntity
  requirementPackageId: number
}

export const requirementPackageCoAuthorEntity =
  new EntitySchema<RequirementPackageCoAuthorEntity>({
    name: 'RequirementPackageCoAuthor',
    tableName: 'requirement_package_co_authors',
    columns: {
      requirementPackageId: {
        name: 'requirement_package_id',
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
        name: 'idx_requirement_package_co_authors_hsa_id',
        columns: ['hsaId'],
      },
      {
        name: 'idx_requirement_package_co_authors_created_by_hsa_id',
        columns: ['createdByHsaId'],
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
            'fk_requirement_package_co_authors_requirement_package_id',
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
          foreignKeyConstraintName: 'fk_requirement_package_co_authors_hsa_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
