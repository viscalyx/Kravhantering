import { EntitySchema } from 'typeorm'

export interface RequirementStatusEntity {
  color: string
  id: number
  isSystem: boolean
  nameEn: string
  nameSv: string
  sortOrder: number
}

export const requirementStatusEntity =
  new EntitySchema<RequirementStatusEntity>({
    name: 'RequirementStatus',
    tableName: 'requirement_statuses',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      nameSv: { name: 'name_sv', type: 'nvarchar', length: 450 },
      nameEn: { name: 'name_en', type: 'nvarchar', length: 450 },
      sortOrder: { name: 'sort_order', type: 'int', default: 0 },
      color: { name: 'color', type: 'nvarchar', length: 'MAX' },
      isSystem: { name: 'is_system', type: 'bit', default: false },
    },
    uniques: [
      { name: 'uq_requirement_statuses_name_en', columns: ['nameEn'] },
      { name: 'uq_requirement_statuses_name_sv', columns: ['nameSv'] },
    ],
  })
