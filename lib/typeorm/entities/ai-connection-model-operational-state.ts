import { EntitySchema } from 'typeorm'
import type { AiConnectionModelRevisionEntity } from './ai-connection-model-revision'

export type AiConnectionModelHealthStatus =
  | 'degraded'
  | 'healthy'
  | 'unavailable'
  | 'unknown'

export type AiCircuitBreakerStatus = 'closed' | 'half_open' | 'open'

export interface AiConnectionModelOperationalStateEntity {
  automaticRecoveryAttemptCount: number
  circuitBreakerStatus: AiCircuitBreakerStatus
  circuitOpenedAt: Date | null
  circuitOpenReason: string | null
  consecutiveFailureCount: number
  healthStatus: AiConnectionModelHealthStatus
  id: string
  isManualRecoveryRequired: boolean
  lastHealthEvidenceAt: Date | null
  leaseExpiresAt: Date | null
  leaseOwnerId: string | null
  leaseRunId: string | null
  modelRevision: AiConnectionModelRevisionEntity
  nextRecoveryAt: Date | null
  revisionToken: string
  updatedAt: Date
}

export const aiConnectionModelOperationalStateEntity =
  new EntitySchema<AiConnectionModelOperationalStateEntity>({
    name: 'AiConnectionModelOperationalState',
    tableName: 'ai_connection_model_operational_states',
    columns: {
      id: {
        default: () => 'NEWID()',
        name: 'id',
        primary: true,
        type: 'uniqueidentifier',
      },
      healthStatus: {
        default: 'unknown',
        length: 24,
        name: 'health_status',
        type: 'nvarchar',
      },
      circuitBreakerStatus: {
        default: 'closed',
        length: 24,
        name: 'circuit_breaker_status',
        type: 'nvarchar',
      },
      consecutiveFailureCount: {
        default: 0,
        name: 'consecutive_failure_count',
        type: 'int',
      },
      automaticRecoveryAttemptCount: {
        default: 0,
        name: 'automatic_recovery_attempt_count',
        type: 'int',
      },
      isManualRecoveryRequired: {
        default: false,
        name: 'is_manual_recovery_required',
        type: 'bit',
      },
      lastHealthEvidenceAt: {
        name: 'last_health_evidence_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      circuitOpenedAt: {
        name: 'circuit_opened_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      circuitOpenReason: {
        length: 80,
        name: 'circuit_open_reason',
        nullable: true,
        type: 'nvarchar',
      },
      nextRecoveryAt: {
        name: 'next_recovery_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      leaseOwnerId: {
        name: 'lease_owner_id',
        nullable: true,
        type: 'uniqueidentifier',
      },
      leaseRunId: {
        name: 'lease_run_id',
        nullable: true,
        type: 'uniqueidentifier',
      },
      leaseExpiresAt: {
        name: 'lease_expires_at',
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
      modelRevision: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_connection_model_operational_states_ai_connection_model_revision_id',
          name: 'ai_connection_model_revision_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
        target: 'AiConnectionModelRevision',
        type: 'many-to-one',
      },
    },
    indices: [
      {
        columns: ['modelRevision'],
        name: 'uq_ai_connection_model_operational_states_revision',
        unique: true,
      },
      {
        columns: ['circuitBreakerStatus', 'nextRecoveryAt'],
        name: 'idx_ai_connection_model_operational_states_recovery',
      },
      {
        columns: ['leaseExpiresAt'],
        name: 'idx_ai_connection_model_operational_states_lease_expires_at',
      },
    ],
    checks: [
      {
        expression:
          "[health_status] IN (N'unknown', N'healthy', N'degraded', N'unavailable')",
        name: 'chk_ai_connection_model_operational_states_health_status',
      },
      {
        expression:
          "[circuit_breaker_status] IN (N'closed', N'open', N'half_open')",
        name: 'chk_ai_connection_model_operational_states_breaker_status',
      },
      {
        expression:
          "([circuit_breaker_status] = N'closed' AND [circuit_open_reason] IS NULL) OR ([circuit_breaker_status] <> N'closed' AND [circuit_open_reason] IS NOT NULL)",
        name: 'chk_ai_connection_model_operational_states_circuit_reason',
      },
      {
        expression: '[consecutive_failure_count] BETWEEN 0 AND 5',
        name: 'chk_ai_connection_model_operational_states_failure_count',
      },
      {
        expression: '[automatic_recovery_attempt_count] BETWEEN 0 AND 5',
        name: 'chk_ai_connection_model_operational_states_recovery_count',
      },
      {
        expression:
          '([lease_owner_id] IS NULL AND [lease_run_id] IS NULL AND [lease_expires_at] IS NULL) OR ([lease_owner_id] IS NOT NULL AND [lease_run_id] IS NOT NULL AND [lease_expires_at] IS NOT NULL)',
        name: 'chk_ai_connection_model_operational_states_lease',
      },
    ],
  })
