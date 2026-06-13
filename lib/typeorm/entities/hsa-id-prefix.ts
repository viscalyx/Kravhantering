import { EntitySchema } from 'typeorm'

export interface HsaIdPrefixEntity {
  createdAt: Date
  id: number
  isDefault: boolean
  isVisible: boolean
  label: string | null
  prefix: string
  updatedAt: Date
}

export const hsaIdPrefixEntity = new EntitySchema<HsaIdPrefixEntity>({
  name: 'HsaIdPrefix',
  tableName: 'hsa_id_prefixes',
  columns: {
    id: {
      name: 'id',
      primary: true,
      type: 'int',
      generated: 'increment',
    },
    prefix: { name: 'prefix', type: 'nvarchar', length: 12 },
    label: {
      name: 'label',
      type: 'nvarchar',
      length: 450,
      nullable: true,
    },
    isVisible: {
      name: 'is_visible',
      type: 'bit',
      default: true,
    },
    isDefault: {
      name: 'is_default',
      type: 'bit',
      default: false,
    },
    createdAt: { name: 'created_at', type: 'datetime2' },
    updatedAt: { name: 'updated_at', type: 'datetime2' },
  },
  uniques: [
    {
      name: 'uq_hsa_id_prefixes_prefix',
      columns: ['prefix'],
    },
  ],
  indices: [
    {
      name: 'uq_hsa_id_prefixes_default',
      columns: ['isDefault'],
      unique: true,
      where: '[is_default] = 1',
    },
    {
      name: 'idx_hsa_id_prefixes_is_visible',
      columns: ['isVisible'],
    },
  ],
})
