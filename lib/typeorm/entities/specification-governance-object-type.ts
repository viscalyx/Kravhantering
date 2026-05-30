import { EntitySchema } from 'typeorm'

export interface SpecificationGovernanceObjectTypeEntity {
  id: number
  nameEn: string
  nameSv: string
}

export const specificationGovernanceObjectTypeEntity =
  new EntitySchema<SpecificationGovernanceObjectTypeEntity>({
    name: 'SpecificationGovernanceObjectType',
    tableName: 'specification_governance_object_types',
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
        name: 'uq_specification_governance_object_types_name_en',
        columns: ['nameEn'],
      },
      {
        name: 'uq_specification_governance_object_types_name_sv',
        columns: ['nameSv'],
      },
    ],
  })
