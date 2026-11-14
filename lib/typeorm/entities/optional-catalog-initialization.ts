import { EntitySchema } from 'typeorm'

export interface OptionalCatalogInitializationEntity {
  completedAt: Date | null
  createdAt: Date
  id: number
}

export const optionalCatalogInitializationEntity =
  new EntitySchema<OptionalCatalogInitializationEntity>({
    name: 'OptionalCatalogInitialization',
    tableName: 'optional_catalog_initializations',
    columns: {
      id: { name: 'id', type: 'int', primary: true },
      createdAt: { name: 'created_at', type: 'datetime2' },
      completedAt: { name: 'completed_at', type: 'datetime2', nullable: true },
    },
    checks: [
      {
        name: 'chk_optional_catalog_initializations_id',
        expression: '[id] = 1',
      },
    ],
  })
