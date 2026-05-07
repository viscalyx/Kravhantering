import { EntitySchema } from 'typeorm'

export interface SpecificationImplementationTypeEntity {
  id: number
  nameEn: string
  nameSv: string
}

export const specificationImplementationTypeEntity =
  new EntitySchema<SpecificationImplementationTypeEntity>({
    name: 'SpecificationImplementationType',
    tableName: 'specification_implementation_types',
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
        name: 'uq_specification_implementation_types_name_en',
        columns: ['nameEn'],
      },
      {
        name: 'uq_specification_implementation_types_name_sv',
        columns: ['nameSv'],
      },
    ],
  })
