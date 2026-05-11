import { EntitySchema } from 'typeorm'

export interface OwnerEntity {
  createdAt: Date
  email: string | null
  firstName: string
  hsaId: string | null
  id: number
  lastName: string
  updatedAt: Date
}

export const ownerEntity = new EntitySchema<OwnerEntity>({
  name: 'Owner',
  tableName: 'owners',
  columns: {
    id: {
      name: 'id',
      generated: 'increment',
      primary: true,
      type: 'int',
    },
    firstName: {
      name: 'first_name',
      type: 'nvarchar',
    },
    lastName: {
      name: 'last_name',
      type: 'nvarchar',
    },
    email: {
      name: 'email',
      type: 'nvarchar',
      length: 450,
      nullable: true,
    },
    hsaId: {
      name: 'hsa_id',
      type: 'nvarchar',
      length: 64,
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'datetime2',
    },
    updatedAt: {
      name: 'updated_at',
      type: 'datetime2',
    },
  },
  uniques: [
    { columns: ['email'], name: 'uq_owners_email' },
    { columns: ['hsaId'], name: 'uq_owners_hsa_id' },
  ],
})
