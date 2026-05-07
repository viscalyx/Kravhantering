import { EntitySchema } from 'typeorm'

export interface SpecificationLifecycleStatusEntity {
  id: number
  nameEn: string
  nameSv: string
}

export const specificationLifecycleStatusEntity =
  new EntitySchema<SpecificationLifecycleStatusEntity>({
    name: 'SpecificationLifecycleStatus',
    tableName: 'specification_lifecycle_statuses',
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
      {
        name: 'uq_specification_lifecycle_statuses_name_en',
        columns: ['nameEn'],
      },
      {
        name: 'uq_specification_lifecycle_statuses_name_sv',
        columns: ['nameSv'],
      },
    ],
  })
