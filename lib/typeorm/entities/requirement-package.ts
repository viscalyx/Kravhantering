import { EntitySchema } from 'typeorm'
import type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'

export interface RequirementPackageEntity {
  createdAt: Date
  id: number
  isArchived: boolean
  lead: RequirementResponsibilityPersonEntity
  leadHsaId: string
  name: string
  purposeAndScope: string
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
      name: { name: 'name', type: 'nvarchar', length: 'MAX' },
      purposeAndScope: {
        name: 'purpose_and_scope',
        type: 'nvarchar',
        length: 'MAX',
      },
      leadHsaId: { name: 'lead_hsa_id', type: 'nvarchar', length: 31 },
      isArchived: { name: 'is_archived', type: 'bit', default: false },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        name: 'idx_requirement_packages_lead_hsa_id',
        columns: ['leadHsaId'],
      },
      {
        name: 'idx_requirement_packages_is_archived',
        columns: ['isArchived'],
      },
    ],
    relations: {
      lead: {
        type: 'many-to-one',
        target: 'RequirementResponsibilityPerson',
        joinColumn: {
          name: 'lead_hsa_id',
          referencedColumnName: 'hsaId',
          foreignKeyConstraintName: 'fk_requirement_packages_lead_hsa_id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    },
  })
