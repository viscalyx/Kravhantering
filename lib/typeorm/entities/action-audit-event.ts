import { EntitySchema } from 'typeorm'

export type ActionAuditActorKind = 'mcp_client' | 'system' | 'user'
export type ActionAuditDecision = 'allowed' | 'denied'

export interface ActionAuditEventEntity {
  action: string
  actorClientId: string | null
  actorDisplayName: string | null
  actorHsaId: string | null
  actorKind: ActionAuditActorKind
  clientIp: string | null
  correlationId: string | null
  decision: ActionAuditDecision
  denialReason: string | null
  detailsJson: string | null
  id: string
  occurredAt: Date
  requestId: string | null
  targetId: string | null
  targetKind: string
  targetUniqueId: string | null
}

export const actionAuditEventEntity = new EntitySchema<ActionAuditEventEntity>({
  name: 'ActionAuditEvent',
  tableName: 'action_audit_events',
  columns: {
    id: {
      generated: 'increment',
      name: 'id',
      primary: true,
      type: 'bigint',
    },
    occurredAt: {
      name: 'occurred_at',
      precision: 3,
      type: 'datetime2',
    },
    actorHsaId: {
      length: 64,
      name: 'actor_hsa_id',
      nullable: true,
      type: 'nvarchar',
    },
    actorDisplayName: {
      length: 'MAX',
      name: 'actor_display_name',
      nullable: true,
      type: 'nvarchar',
    },
    actorKind: {
      length: 32,
      name: 'actor_kind',
      type: 'nvarchar',
    },
    actorClientId: {
      length: 255,
      name: 'actor_client_id',
      nullable: true,
      type: 'nvarchar',
    },
    action: {
      length: 64,
      name: 'action',
      type: 'nvarchar',
    },
    targetKind: {
      length: 64,
      name: 'target_kind',
      type: 'nvarchar',
    },
    targetId: {
      length: 255,
      name: 'target_id',
      nullable: true,
      type: 'nvarchar',
    },
    targetUniqueId: {
      length: 255,
      name: 'target_unique_id',
      nullable: true,
      type: 'nvarchar',
    },
    decision: {
      length: 16,
      name: 'decision',
      type: 'nvarchar',
    },
    denialReason: {
      length: 255,
      name: 'denial_reason',
      nullable: true,
      type: 'nvarchar',
    },
    requestId: {
      length: 64,
      name: 'request_id',
      nullable: true,
      type: 'nvarchar',
    },
    correlationId: {
      length: 64,
      name: 'correlation_id',
      nullable: true,
      type: 'nvarchar',
    },
    clientIp: {
      length: 45,
      name: 'client_ip',
      nullable: true,
      type: 'nvarchar',
    },
    detailsJson: {
      length: 'MAX',
      name: 'details_json',
      nullable: true,
      type: 'nvarchar',
    },
  },
  indices: [
    {
      columns: ['occurredAt'],
      name: 'idx_action_audit_events_occurred_at',
    },
    {
      columns: ['actorHsaId', 'occurredAt'],
      name: 'idx_action_audit_events_actor_hsa_id_occurred_at',
    },
    {
      columns: ['targetKind', 'targetId', 'occurredAt'],
      name: 'idx_action_audit_events_target_occurred_at',
    },
    {
      columns: ['action', 'occurredAt'],
      name: 'idx_action_audit_events_action_occurred_at',
    },
    {
      columns: ['clientIp', 'occurredAt'],
      name: 'idx_action_audit_events_client_ip_occurred_at',
    },
  ],
})
