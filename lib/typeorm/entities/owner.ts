import { EntitySchema } from 'typeorm'

export interface OwnerEntity {
  createdAt: Date
  email: string
  firstName: string
  id: number
  lastName: string
  updatedAt: Date
}

export const ownerEntity = new EntitySchema<OwnerEntity>({
  name: 'Owner',
  tableName: 'owners',
  columns: {
    id: {
      generated: 'increment',
      primary: true,
      type: Number,
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
    {
      columns: ['email'],
      name: 'uq_owners_email',
    },
  ],
})
