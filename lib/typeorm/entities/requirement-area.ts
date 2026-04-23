import { EntitySchema } from 'typeorm'
import type { OwnerEntity } from '@/lib/typeorm/entities/owner'

export interface RequirementAreaEntity {
  createdAt: Date
  description: string | null
  id: number
  name: string
  nextSequence: number
  owner: OwnerEntity | null
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
    nextSequence: { name: 'next_sequence', type: 'int', default: 1 },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  uniques: [{ name: 'uq_requirement_areas_prefix', columns: ['prefix'] }],
  relations: {
    owner: {
      type: 'many-to-one',
      target: 'Owner',
      joinColumn: {
        name: 'owner_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'fk_requirement_areas_owner_id',
      },
      nullable: true,
      onDelete: 'NO ACTION',
    },
  },
})
