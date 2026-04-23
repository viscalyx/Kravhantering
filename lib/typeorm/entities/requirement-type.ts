import { EntitySchema } from 'typeorm'

export interface RequirementTypeEntity {
  id: number
  nameEn: string
  nameSv: string
}

export const requirementTypeEntity = new EntitySchema<RequirementTypeEntity>({
  name: 'RequirementType',
  tableName: 'requirement_types',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    nameSv: { name: 'name_sv', type: 'nvarchar', length: 450 },
    nameEn: { name: 'name_en', type: 'nvarchar', length: 450 },
  },
  uniques: [
    { name: 'uq_requirement_types_name_en', columns: ['nameEn'] },
    { name: 'uq_requirement_types_name_sv', columns: ['nameSv'] },
  ],
})
