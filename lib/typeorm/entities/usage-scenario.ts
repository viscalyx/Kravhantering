import { EntitySchema } from 'typeorm'
import type { OwnerEntity } from '@/lib/typeorm/entities/owner'

export interface UsageScenarioEntity {
  createdAt: Date
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  owner: OwnerEntity | null
  updatedAt: Date
}

export const usageScenarioEntity = new EntitySchema<UsageScenarioEntity>({
  name: 'UsageScenario',
  tableName: 'usage_scenarios',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    nameSv: { name: 'name_sv', type: 'nvarchar', length: 'MAX' },
    nameEn: { name: 'name_en', type: 'nvarchar', length: 'MAX' },
    descriptionSv: {
      name: 'description_sv',
      type: 'nvarchar',
      length: 'MAX',
      nullable: true,
    },
    descriptionEn: {
      name: 'description_en',
      type: 'nvarchar',
      length: 'MAX',
      nullable: true,
    },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  relations: {
    owner: {
      type: 'many-to-one',
      target: 'Owner',
      joinColumn: {
        name: 'owner_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'fk_usage_scenarios_owner_id',
      },
      nullable: true,
      onDelete: 'NO ACTION',
    },
  },
})
