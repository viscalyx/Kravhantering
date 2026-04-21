import { EntitySchema } from 'typeorm'

export interface NormReferenceEntity {
  createdAt: Date
  id: number
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: Date
  uri: string | null
  version: string | null
}

export const normReferenceEntity = new EntitySchema<NormReferenceEntity>({
  name: 'NormReference',
  tableName: 'norm_references',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    normReferenceId: {
      name: 'norm_reference_id',
      type: 'nvarchar',
      length: 450,
    },
    name: { name: 'name', type: 'nvarchar', length: 'MAX' },
    type: { name: 'type', type: 'nvarchar', length: 'MAX' },
    reference: { name: 'reference', type: 'nvarchar', length: 'MAX' },
    version: {
      name: 'version',
      type: 'nvarchar',
      length: 'MAX',
      nullable: true,
    },
    issuer: { name: 'issuer', type: 'nvarchar', length: 'MAX' },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
    uri: { name: 'uri', type: 'nvarchar', length: 'MAX', nullable: true },
  },
  uniques: [
    {
      name: 'uq_norm_references_norm_reference_id',
      columns: ['normReferenceId'],
    },
  ],
})
