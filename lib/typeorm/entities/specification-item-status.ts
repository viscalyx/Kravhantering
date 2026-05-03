import { EntitySchema } from 'typeorm'

export interface SpecificationItemStatusEntity {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

export const specificationItemStatusEntity =
  new EntitySchema<SpecificationItemStatusEntity>({
    name: 'SpecificationItemStatus',
    tableName: 'specification_item_statuses',
    columns: {
      id: {
        name: 'id',
        primary: true,
        type: 'int',
        generated: 'increment',
      },
      nameSv: { name: 'name_sv', type: 'nvarchar', length: 450 },
      nameEn: { name: 'name_en', type: 'nvarchar', length: 450 },
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
      color: { name: 'color', type: 'nvarchar', length: 'MAX' },
      sortOrder: { name: 'sort_order', type: 'int', default: 0 },
    },
    uniques: [
      { name: 'uq_specification_item_statuses_name_en', columns: ['nameEn'] },
      { name: 'uq_specification_item_statuses_name_sv', columns: ['nameSv'] },
    ],
  })
