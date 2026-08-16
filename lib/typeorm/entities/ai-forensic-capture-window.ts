import { EntitySchema } from 'typeorm'

export interface AiForensicCaptureWindowEntity {
  approvedAt: Date | null
  approvedByDisplayName: string | null
  approvedByHsaId: string | null
  collectionItemLimit: number
  direction: string
  eventByteLimit: number
  eventItemLimit: number
  expiresAt: Date
  expiryAuditedAt: Date | null
  id: number
  isOpen: boolean | null
  operation: string
  purgedAt: Date | null
  purgedByDisplayName: string | null
  purgedByHsaId: string | null
  requestedAt: Date
  requestedByDisplayName: string
  requestedByHsaId: string | null
  stoppedAt: Date | null
  stoppedByDisplayName: string | null
  stoppedByHsaId: string | null
}

export const aiForensicCaptureWindowEntity =
  new EntitySchema<AiForensicCaptureWindowEntity>({
    name: 'AiForensicCaptureWindow',
    tableName: 'ai_forensic_capture_windows',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      operation: { length: 80, name: 'operation', type: 'nvarchar' },
      direction: { length: 6, name: 'direction', type: 'nvarchar' },
      requestedByHsaId: {
        length: 64,
        name: 'requested_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      requestedByDisplayName: {
        length: 255,
        name: 'requested_by_display_name',
        type: 'nvarchar',
      },
      requestedAt: { name: 'requested_at', precision: 3, type: 'datetime2' },
      approvedByHsaId: {
        length: 64,
        name: 'approved_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      approvedByDisplayName: {
        length: 255,
        name: 'approved_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      approvedAt: {
        name: 'approved_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      expiresAt: { name: 'expires_at', precision: 3, type: 'datetime2' },
      expiryAuditedAt: {
        name: 'expiry_audited_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      stoppedByHsaId: {
        length: 64,
        name: 'stopped_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      stoppedByDisplayName: {
        length: 255,
        name: 'stopped_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      stoppedAt: {
        name: 'stopped_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      purgedByHsaId: {
        length: 64,
        name: 'purged_by_hsa_id',
        nullable: true,
        type: 'nvarchar',
      },
      purgedByDisplayName: {
        length: 255,
        name: 'purged_by_display_name',
        nullable: true,
        type: 'nvarchar',
      },
      purgedAt: {
        name: 'purged_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      isOpen: {
        name: 'is_open',
        nullable: true,
        type: 'bit',
      },
      eventByteLimit: { name: 'event_byte_limit', type: 'int' },
      eventItemLimit: { name: 'event_item_limit', type: 'int' },
      collectionItemLimit: { name: 'collection_item_limit', type: 'int' },
    },
    indices: [
      {
        columns: ['isOpen'],
        name: 'uq_ai_forensic_capture_windows_is_open',
        unique: true,
        where: '[is_open] = 1',
      },
      {
        columns: ['expiresAt'],
        name: 'idx_ai_forensic_capture_windows_expires_at',
      },
      {
        columns: ['requestedByHsaId'],
        name: 'idx_ai_forensic_capture_windows_requested_by_hsa_id',
      },
      {
        columns: ['approvedByHsaId'],
        name: 'idx_ai_forensic_capture_windows_approved_by_hsa_id',
      },
    ],
    checks: [
      {
        expression:
          "[operation] IN (N'ai.generate-requirement-import', N'ai.repair-requirement-import-json')",
        name: 'chk_ai_forensic_capture_windows_operation',
      },
      {
        expression: "[direction] IN (N'input', N'output')",
        name: 'chk_ai_forensic_capture_windows_direction',
      },
      {
        expression:
          '[expires_at] BETWEEN DATEADD(minute, 5, [requested_at]) AND DATEADD(minute, 60, [requested_at])',
        name: 'chk_ai_forensic_capture_windows_expires_at',
      },
      {
        expression: '[event_byte_limit] BETWEEN 256 AND 8192',
        name: 'chk_ai_forensic_capture_windows_event_byte_limit',
      },
      {
        expression: '[event_item_limit] BETWEEN 1 AND 8',
        name: 'chk_ai_forensic_capture_windows_event_item_limit',
      },
      {
        expression: '[collection_item_limit] BETWEEN 1 AND 1000',
        name: 'chk_ai_forensic_capture_windows_collection_item_limit',
      },
    ],
  })
