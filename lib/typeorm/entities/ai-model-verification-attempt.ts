import { EntitySchema } from 'typeorm'
import type { AiConnectionEntity } from './ai-connection'

export interface AiModelVerificationAttemptEntity {
  connection: AiConnectionEntity
  createdAt: Date
  expiresAt: Date
  fingerprint: string
  id: string
  payloadJson: string
}

export const aiModelVerificationAttemptEntity =
  new EntitySchema<AiModelVerificationAttemptEntity>({
    name: 'AiModelVerificationAttempt',
    tableName: 'ai_model_verification_attempts',
    columns: {
      id: { name: 'id', type: 'uniqueidentifier', primary: true },
      fingerprint: { name: 'fingerprint', type: 'nvarchar', length: 64 },
      payloadJson: { name: 'payload_json', type: 'nvarchar', length: 'MAX' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      expiresAt: { name: 'expires_at', type: 'datetime2' },
    },
    relations: {
      connection: {
        type: 'many-to-one',
        target: 'AiConnection',
        nullable: false,
        onDelete: 'NO ACTION',
        joinColumn: {
          name: 'ai_connection_id',
          referencedColumnName: 'id',
          foreignKeyConstraintName:
            'fk_ai_model_verification_attempts_ai_connection_id',
        },
      },
    },
    indices: [
      {
        name: 'idx_ai_model_verification_attempts_expires_at',
        columns: ['expiresAt'],
      },
      {
        name: 'idx_ai_model_verification_attempts_ai_connection_id',
        columns: ['connection', 'expiresAt'],
      },
    ],
    checks: [
      {
        name: 'chk_ai_model_verification_attempts_payload',
        expression:
          'ISJSON([payload_json]) = 1 AND DATALENGTH([payload_json]) <= 65536',
      },
      {
        name: 'chk_ai_model_verification_attempts_ttl',
        expression: '[expires_at] = DATEADD(minute, 15, [created_at])',
      },
    ],
  })
