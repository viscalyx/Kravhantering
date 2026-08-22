import { EntitySchema } from 'typeorm'
import type { AiConnectionEntity } from './ai-connection'

export interface AiConnectionModelEntity {
  connection: AiConnectionEntity
  createdAt: Date
  deletedAt: Date | null
  description: string | null
  id: string
  name: string
  revisionToken: string
  updatedAt: Date
}

export const aiConnectionModelEntity =
  new EntitySchema<AiConnectionModelEntity>({
    name: 'AiConnectionModel',
    tableName: 'ai_connection_models',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      name: { length: 300, name: 'name', type: 'nvarchar' },
      description: {
        length: 'MAX',
        name: 'description',
        nullable: true,
        type: 'nvarchar',
      },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      deletedAt: {
        name: 'deleted_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      updatedAt: { name: 'updated_at', precision: 3, type: 'datetime2' },
      revisionToken: {
        default: () => 'NEWID()',
        name: 'revision_token',
        type: 'uniqueidentifier',
      },
    },
    relations: {
      connection: {
        joinColumn: {
          foreignKeyConstraintName: 'fk_ai_connection_models_ai_connection_id',
          name: 'ai_connection_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnection',
        type: 'many-to-one',
      },
    },
    indices: [
      {
        columns: ['connection'],
        name: 'idx_ai_connection_models_ai_connection_id',
      },
    ],
  })
