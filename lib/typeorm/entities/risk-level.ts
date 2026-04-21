import { EntitySchema } from 'typeorm'

export interface RiskLevelEntity {
  color: string
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

export const riskLevelEntity = new EntitySchema<RiskLevelEntity>({
  name: 'RiskLevel',
  tableName: 'risk_levels',
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
  },
  uniques: [
    { name: 'uq_risk_levels_name_en', columns: ['nameEn'] },
    { name: 'uq_risk_levels_name_sv', columns: ['nameSv'] },
  ],
})
