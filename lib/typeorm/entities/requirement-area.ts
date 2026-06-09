import { EntitySchema } from 'typeorm'
import type { RequirementResponsibilityPersonEntity } from '@/lib/typeorm/entities/requirement-responsibility-person'

export interface RequirementAreaEntity {
  createdAt: Date
  description: string | null
  id: number
  name: string
  nextSequence: number
  owner: RequirementResponsibilityPersonEntity
  ownerHsaId: string
  prefix: string
  updatedAt: Date
}

export const requirementAreaEntity = new EntitySchema<RequirementAreaEntity>({
  name: 'RequirementArea',
  tableName: 'requirement_areas',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    prefix: { name: 'prefix', type: 'nvarchar', length: 450 },
    name: { name: 'name', type: 'nvarchar', length: 'MAX' },
    description: {
      name: 'description',
      type: 'nvarchar',
      length: 'MAX',
      nullable: true,
    },
    ownerHsaId: { name: 'owner_hsa_id', type: 'nvarchar', length: 31 },
    nextSequence: { name: 'next_sequence', type: 'int', default: 1 },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  uniques: [{ name: 'uq_requirement_areas_prefix', columns: ['prefix'] }],
  indices: [
    { name: 'idx_requirement_areas_owner_hsa_id', columns: ['ownerHsaId'] },
  ],
  relations: {
    owner: {
      type: 'many-to-one',
      target: 'RequirementResponsibilityPerson',
      joinColumn: {
        name: 'owner_hsa_id',
        referencedColumnName: 'hsaId',
        foreignKeyConstraintName: 'fk_requirement_areas_owner_hsa_id',
      },
      nullable: false,
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    },
  },
})
