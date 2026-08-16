import { EntitySchema } from 'typeorm'
import type { AiForensicCaptureWindowEntity } from './ai-forensic-capture-window'

export interface AiForensicEvidenceEventEntity {
  actorFingerprint: string | null
  blockedStep: string
  byteCount: number
  capturedAt: Date
  captureWindow: AiForensicCaptureWindowEntity
  eventId: string
  evidenceJson: string
  id: number
  itemCount: number
  primaryRuleId: string | null
  ruleIdsJson: string
}

export const aiForensicEvidenceEventEntity =
  new EntitySchema<AiForensicEvidenceEventEntity>({
    name: 'AiForensicEvidenceEvent',
    tableName: 'ai_forensic_evidence_events',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'bigint',
      },
      eventId: { name: 'event_id', type: 'uniqueidentifier' },
      actorFingerprint: {
        length: 64,
        name: 'actor_fingerprint',
        nullable: true,
        type: 'nvarchar',
      },
      blockedStep: { length: 40, name: 'blocked_step', type: 'nvarchar' },
      primaryRuleId: {
        length: 80,
        name: 'primary_rule_id',
        nullable: true,
        type: 'nvarchar',
      },
      ruleIdsJson: { length: 1024, name: 'rule_ids_json', type: 'nvarchar' },
      evidenceJson: { length: 'MAX', name: 'evidence_json', type: 'nvarchar' },
      itemCount: { name: 'item_count', type: 'int' },
      byteCount: { name: 'byte_count', type: 'int' },
      capturedAt: { name: 'captured_at', precision: 3, type: 'datetime2' },
    },
    relations: {
      captureWindow: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_forensic_evidence_events_ai_forensic_capture_window_id',
          name: 'ai_forensic_capture_window_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
        target: 'AiForensicCaptureWindow',
        type: 'many-to-one',
      },
    },
    indices: [
      {
        columns: ['eventId'],
        name: 'uq_ai_forensic_evidence_events_event_id',
        unique: true,
      },
      {
        columns: ['captureWindow'],
        name: 'idx_ai_forensic_evidence_events_ai_forensic_capture_window_id',
      },
      {
        columns: ['actorFingerprint'],
        name: 'idx_ai_forensic_evidence_events_actor_fingerprint',
      },
      {
        columns: ['capturedAt'],
        name: 'idx_ai_forensic_evidence_events_captured_at',
      },
    ],
    checks: [
      {
        expression: 'ISJSON([rule_ids_json]) = 1',
        name: 'chk_ai_forensic_evidence_events_rule_ids_json',
      },
      {
        expression: 'ISJSON([evidence_json]) = 1',
        name: 'chk_ai_forensic_evidence_events_evidence_json',
      },
      {
        expression: '[item_count] BETWEEN 1 AND 8',
        name: 'chk_ai_forensic_evidence_events_item_count',
      },
      {
        expression:
          '[byte_count] BETWEEN 2 AND 8192 AND DATALENGTH([evidence_json]) = [byte_count]',
        name: 'chk_ai_forensic_evidence_events_byte_count',
      },
    ],
  })
