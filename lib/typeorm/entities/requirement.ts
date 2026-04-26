import { EntitySchema } from 'typeorm'
import type { RequirementAreaEntity } from '@/lib/typeorm/entities/requirement-area'

export interface RequirementEntity {
  createdAt: Date
  id: number
  isArchived: boolean
  requirementArea: RequirementAreaEntity
  sequenceNumber: number
  uniqueId: string
}

export const requirementEntity = new EntitySchema<RequirementEntity>({
  name: 'Requirement',
  tableName: 'requirements',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    uniqueId: { name: 'unique_id', type: 'nvarchar', length: 450 },
    sequenceNumber: { name: 'sequence_number', type: 'int' },
    isArchived: { name: 'is_archived', type: 'bit', default: false },
    createdAt: { name: 'created_at', type: 'datetime2' },
  },
  uniques: [{ name: 'uq_requirements_unique_id', columns: ['uniqueId'] }],
  indices: [
    { name: 'idx_requirements_is_archived', columns: ['isArchived'] },
    {
      name: 'idx_requirements_requirement_area_id',
      columns: ['requirementArea'],
    },
  ],
  relations: {
    requirementArea: {
      type: 'many-to-one',
      target: 'RequirementArea',
      joinColumn: {
        name: 'requirement_area_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'fk_requirements_requirement_area_id',
      },
      nullable: false,
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    },
  },
})
