import { EntitySchema } from 'typeorm'

export interface RequirementCategoryEntity {
  id: number
  nameEn: string
  nameSv: string
}

export const requirementCategoryEntity =
  new EntitySchema<RequirementCategoryEntity>({
    name: 'RequirementCategory',
    tableName: 'requirement_categories',
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
      { name: 'uq_requirement_categories_name_en', columns: ['nameEn'] },
      { name: 'uq_requirement_categories_name_sv', columns: ['nameSv'] },
    ],
  })
