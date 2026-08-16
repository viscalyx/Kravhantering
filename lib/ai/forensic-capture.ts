import { recordSecurityEvent } from '@/lib/auth/audit'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  conflictError,
  forbiddenError,
  validationError,
} from '@/lib/requirements/errors'
import type { AiSafetyDirection } from './safety'

export const AI_FORENSIC_OPERATIONS = [
  'ai.generate-requirement-import',
  'ai.repair-requirement-import-json',
] as const

export type AiForensicOperation = (typeof AI_FORENSIC_OPERATIONS)[number]
export type AiForensicCaptureStatus =
  | 'active'
  | 'expired'
  | 'pending_approval'
  | 'purged'
  | 'stopped'

export interface AiForensicCaptureSummary {
  direction: AiSafetyDirection
  expiresAt: string
  id: number
  operation: AiForensicOperation
  status: AiForensicCaptureStatus
}

export interface CreateAiForensicCaptureInput {
  direction: AiSafetyDirection
  expiresAt: string
  operation: AiForensicOperation
}

export type AiForensicCaptureAction = 'approve' | 'purge' | 'stop'

export interface TransitionAiForensicCaptureInput {
  action: AiForensicCaptureAction
  captureWindowId: number
}

interface CaptureRow {
  direction: AiSafetyDirection
  expiresAt: Date | string
  id: number
  operation: AiForensicOperation
  status: AiForensicCaptureStatus
}

interface EvidenceRow extends CaptureRow {
  blockedStep: string | null
  capturedAt: Date | string | null
  eventId: string | null
  evidenceJson: string | null
  primaryRuleId: string | null
  ruleIdsJson: string | null
}

export interface AiForensicEvidenceRecord {
  blockedStep: string
  capturedAt: string
  eventId: string
  evidence: unknown[]
  primaryRuleId: string | null
  ruleIds: string[]
}

export interface AiForensicEvidenceResult {
  capture: AiForensicCaptureSummary
  events: AiForensicEvidenceRecord[]
}

export interface AiForensicCaptureMetadata extends AiForensicCaptureSummary {
  eventCount: number
  requestedAt: string
  stoppedAt: string | null
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function summary(row: CaptureRow): AiForensicCaptureSummary {
  return {
    direction: row.direction,
    expiresAt: iso(row.expiresAt),
    id: Number(row.id),
    operation: row.operation,
    status: row.status,
  }
}

export async function createAiForensicCaptureRequest(
  db: SqlServerDatabase,
  context: RequestContext,
  input: CreateAiForensicCaptureInput,
): Promise<AiForensicCaptureSummary> {
  const actor = requireHumanActorSnapshot(context)
  const rows = await db.transaction('SERIALIZABLE', async manager =>
    manager.query<CaptureRow[]>(
      `
        UPDATE ai_forensic_capture_windows
        SET is_open = NULL
        WHERE is_open = 1
          AND expires_at <= SYSUTCDATETIME();

        IF EXISTS (
          SELECT 1 FROM ai_forensic_capture_windows WITH (UPDLOCK, HOLDLOCK)
          WHERE is_open = 1
        )
        BEGIN
          SELECT CAST(NULL AS int) AS id WHERE 1 = 0;
          RETURN;
        END;

        DECLARE @expiresAt datetime2(3) = CAST(
          SWITCHOFFSET(CONVERT(datetimeoffset(3), @2, 127), '+00:00')
          AS datetime2(3)
        );

        IF @expiresAt < DATEADD(minute, 5, SYSUTCDATETIME())
          OR @expiresAt > DATEADD(minute, 60, SYSUTCDATETIME())
        BEGIN
          SELECT CAST(-1 AS int) AS id, @0 AS operation, @1 AS direction,
            @expiresAt AS expiresAt, 'pending_approval' AS status;
          RETURN;
        END;

        INSERT INTO ai_forensic_capture_windows (
          operation,
          direction,
          requested_by_hsa_id,
          requested_by_display_name,
          requested_at,
          expires_at,
          is_open,
          event_byte_limit,
          event_item_limit,
          collection_item_limit
        )
        OUTPUT INSERTED.id, INSERTED.operation, INSERTED.direction,
          INSERTED.expires_at AS expiresAt, 'pending_approval' AS status
        VALUES (
          @0, @1, @3, @4, SYSUTCDATETIME(), @expiresAt, 1, 8192, 8, 1000
        );
      `,
      [
        input.operation,
        input.direction,
        input.expiresAt,
        actor.hsaId,
        actor.displayName,
      ],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw conflictError('A forensic capture request or window is already open')
  }
  if (Number(row.id) === -1) {
    throw validationError(
      'Capture expiry must be between 5 and 60 minutes from SQL Server time',
    )
  }
  const result = summary(row)
  recordSecurityEvent({
    actor: {
      hsaId: actor.hsaId,
      source: context.actor.source,
      ...(context.actor.id ? { sub: context.actor.id } : {}),
    },
    detail: {
      captureWindowId: result.id,
      direction: result.direction,
      expiresAt: result.expiresAt,
      operation: result.operation,
    },
    event: 'ai.forensic_capture.requested',
    outcome: 'success',
    request: context.request ?? {
      method: 'POST',
      path: '/api/admin/ai-forensic-captures',
      requestId: context.requestId,
    },
  })
  return result
}

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function listAiForensicCaptureMetadata(
  db: SqlServerDatabase,
  context: RequestContext,
): Promise<AiForensicCaptureMetadata[]> {
  const actor = requireHumanActorSnapshot(context)
  if (
    !context.actor.roles.includes('Admin') &&
    !context.actor.roles.includes('PrivacyOfficer')
  ) {
    throw forbiddenError('Forensic capture metadata is forbidden', {
      reason: 'required_role_missing',
      requiredRoles: ['Admin', 'PrivacyOfficer'],
    })
  }
  const rows = await db.query<
    Array<
      CaptureRow & {
        eventCount: number | string
        requestedAt: Date | string
        stoppedAt: Date | string | null
      }
    >
  >(`
    SELECT TOP (50) capture.id, capture.operation, capture.direction,
      capture.expires_at AS expiresAt,
      capture.requested_at AS requestedAt,
      capture.stopped_at AS stoppedAt,
      COUNT_BIG(evidence.id) AS eventCount,
      CASE
        WHEN capture.purged_at IS NOT NULL THEN 'purged'
        WHEN capture.stopped_at IS NOT NULL THEN 'stopped'
        WHEN capture.expires_at <= SYSUTCDATETIME() THEN 'expired'
        WHEN capture.approved_at IS NOT NULL THEN 'active'
        ELSE 'pending_approval'
      END AS status
    FROM ai_forensic_capture_windows AS capture
    LEFT JOIN ai_forensic_evidence_events AS evidence
      ON evidence.ai_forensic_capture_window_id = capture.id
    GROUP BY capture.id, capture.operation, capture.direction,
      capture.expires_at, capture.requested_at, capture.stopped_at,
      capture.purged_at, capture.approved_at
    ORDER BY capture.requested_at DESC, capture.id DESC
  `)
  const captures = rows.map(row => ({
    ...summary(row),
    eventCount: Number(row.eventCount),
    requestedAt: iso(row.requestedAt),
    stoppedAt: row.stoppedAt == null ? null : iso(row.stoppedAt),
  }))
  recordSecurityEvent({
    actor: {
      hsaId: actor.hsaId,
      source: context.actor.source,
      ...(context.actor.id ? { sub: context.actor.id } : {}),
    },
    detail: { captureCount: captures.length, view: 'metadata' },
    event: 'ai.forensic_evidence.accessed',
    outcome: 'success',
    request: context.request ?? {
      method: 'GET',
      path: '/api/admin/ai-forensic-captures',
      requestId: context.requestId,
    },
  })
  return captures
}

export async function readStoppedAiForensicCaptureEvidence(
  db: SqlServerDatabase,
  context: RequestContext,
  captureWindowId: number,
): Promise<AiForensicEvidenceResult> {
  const actor = requireHumanActorSnapshot(context)
  if (
    !context.actor.roles.includes('Admin') &&
    !context.actor.roles.includes('PrivacyOfficer')
  ) {
    throw forbiddenError('Forensic evidence is unavailable to this actor', {
      captureWindowId,
      reason: 'capture_not_stopped_or_actor_not_party',
    })
  }
  const rows = await db.query<EvidenceRow[]>(
    `
      SELECT capture.id, capture.operation, capture.direction,
        capture.expires_at AS expiresAt,
        CASE
          WHEN capture.purged_at IS NOT NULL THEN 'purged'
          WHEN capture.stopped_at IS NOT NULL THEN 'stopped'
          ELSE 'expired'
        END AS status,
        evidence.event_id AS eventId,
        evidence.blocked_step AS blockedStep,
        evidence.primary_rule_id AS primaryRuleId,
        evidence.rule_ids_json AS ruleIdsJson,
        evidence.evidence_json AS evidenceJson,
        evidence.captured_at AS capturedAt
      FROM ai_forensic_capture_windows AS capture
      LEFT JOIN ai_forensic_evidence_events AS evidence
        ON evidence.ai_forensic_capture_window_id = capture.id
      WHERE capture.id = @0
        AND capture.purged_at IS NULL
        AND (capture.stopped_at IS NOT NULL OR capture.expires_at <= SYSUTCDATETIME())
        AND (
          capture.requested_by_hsa_id = @1
          OR capture.approved_by_hsa_id = @1
        )
      ORDER BY evidence.captured_at, evidence.id
    `,
    [captureWindowId, actor.hsaId],
  )
  const captureRow = rows[0]
  if (!captureRow) {
    throw forbiddenError('Forensic evidence is unavailable to this actor', {
      captureWindowId,
      reason: 'capture_not_stopped_or_actor_not_party',
    })
  }
  const capture = summary(captureRow)
  const events = rows.flatMap(row => {
    if (!row.eventId || !row.blockedStep || !row.capturedAt) return []
    return [
      {
        blockedStep: row.blockedStep,
        capturedAt: iso(row.capturedAt),
        evidence: parseJsonArray(row.evidenceJson),
        eventId: row.eventId,
        primaryRuleId: row.primaryRuleId,
        ruleIds: parseJsonArray(row.ruleIdsJson).filter(
          (value): value is string => typeof value === 'string',
        ),
      },
    ]
  })
  recordSecurityEvent({
    actor: {
      hsaId: actor.hsaId,
      source: context.actor.source,
      ...(context.actor.id ? { sub: context.actor.id } : {}),
    },
    detail: { captureWindowId: capture.id, eventCount: events.length },
    event: 'ai.forensic_evidence.accessed',
    outcome: 'success',
    request: context.request ?? {
      method: 'GET',
      path: '/api/admin/ai-forensic-captures',
      requestId: context.requestId,
    },
  })
  return { capture, events }
}

function assertTransitionRole(
  context: RequestContext,
  action: AiForensicCaptureAction,
): void {
  const roles = context.actor.roles
  const allowed =
    action === 'stop'
      ? roles.includes('Admin') || roles.includes('PrivacyOfficer')
      : roles.includes('PrivacyOfficer')
  if (!allowed) {
    throw forbiddenError('The requested forensic capture action is forbidden', {
      action,
      reason: 'required_role_missing',
    })
  }
}

export function authorizeAiForensicCaptureTransition(
  context: RequestContext,
  action: AiForensicCaptureAction,
): void {
  assertTransitionRole(context, action)
  requireHumanActorSnapshot(context)
}

function transitionEvent(
  action: AiForensicCaptureAction,
):
  | 'ai.forensic_capture.disabled'
  | 'ai.forensic_capture.enabled'
  | 'ai.forensic_evidence.purged' {
  if (action === 'approve') return 'ai.forensic_capture.enabled'
  if (action === 'stop') return 'ai.forensic_capture.disabled'
  return 'ai.forensic_evidence.purged'
}

export async function transitionAiForensicCapture(
  db: SqlServerDatabase,
  context: RequestContext,
  input: TransitionAiForensicCaptureInput,
): Promise<AiForensicCaptureSummary> {
  assertTransitionRole(context, input.action)
  const actor = requireHumanActorSnapshot(context)
  const transition = await db.transaction(async manager => {
    if (input.action === 'approve') {
      const rows = await manager.query<CaptureRow[]>(
        `
          UPDATE ai_forensic_capture_windows WITH (UPDLOCK, ROWLOCK)
          SET approved_by_hsa_id = @1,
              approved_by_display_name = @2,
              approved_at = SYSUTCDATETIME()
          OUTPUT INSERTED.id, INSERTED.operation, INSERTED.direction,
            INSERTED.expires_at AS expiresAt, 'active' AS status
          WHERE id = @0
            AND is_open = 1
            AND approved_at IS NULL
            AND stopped_at IS NULL
            AND purged_at IS NULL
            AND expires_at > SYSUTCDATETIME()
            AND requested_by_hsa_id <> @1
        `,
        [input.captureWindowId, actor.hsaId, actor.displayName],
      )
      if (!rows[0]) return { purgedRows: [], rows }
      const purgedRows = await manager.query<CaptureRow[]>(
        `
          DELETE evidence
          FROM ai_forensic_evidence_events AS evidence
          INNER JOIN ai_forensic_capture_windows AS capture
            ON capture.id = evidence.ai_forensic_capture_window_id
          WHERE capture.id <> @0
            AND capture.purged_at IS NULL
            AND (
              capture.stopped_at IS NOT NULL
              OR capture.expires_at <= SYSUTCDATETIME()
            );

          UPDATE ai_forensic_capture_windows
          SET purged_by_hsa_id = @1,
              purged_by_display_name = @2,
              purged_at = SYSUTCDATETIME(),
              is_open = NULL
          OUTPUT INSERTED.id, INSERTED.operation, INSERTED.direction,
            INSERTED.expires_at AS expiresAt, 'purged' AS status
          WHERE id <> @0
            AND purged_at IS NULL
            AND (
              stopped_at IS NOT NULL
              OR expires_at <= SYSUTCDATETIME()
            );
        `,
        [input.captureWindowId, actor.hsaId, actor.displayName],
      )
      return { purgedRows, rows }
    }
    if (input.action === 'stop') {
      const rows = await manager.query<CaptureRow[]>(
        `
          UPDATE ai_forensic_capture_windows WITH (UPDLOCK, ROWLOCK)
          SET stopped_by_hsa_id = @1,
              stopped_by_display_name = @2,
              stopped_at = SYSUTCDATETIME(),
              is_open = NULL
          OUTPUT INSERTED.id, INSERTED.operation, INSERTED.direction,
            INSERTED.expires_at AS expiresAt, 'stopped' AS status
          WHERE id = @0
            AND is_open = 1
            AND approved_at IS NOT NULL
            AND stopped_at IS NULL
            AND purged_at IS NULL
            AND expires_at > SYSUTCDATETIME()
        `,
        [input.captureWindowId, actor.hsaId, actor.displayName],
      )
      return { purgedRows: [], rows }
    }

    await manager.query(
      `DELETE FROM ai_forensic_evidence_events WHERE ai_forensic_capture_window_id = @0`,
      [input.captureWindowId],
    )
    const rows = await manager.query<CaptureRow[]>(
      `
        UPDATE ai_forensic_capture_windows WITH (UPDLOCK, ROWLOCK)
        SET purged_by_hsa_id = @1,
            purged_by_display_name = @2,
            purged_at = SYSUTCDATETIME(),
            stopped_at = COALESCE(stopped_at, SYSUTCDATETIME()),
            is_open = NULL
        OUTPUT INSERTED.id, INSERTED.operation, INSERTED.direction,
          INSERTED.expires_at AS expiresAt, 'purged' AS status
        WHERE id = @0
          AND purged_at IS NULL
      `,
      [input.captureWindowId, actor.hsaId, actor.displayName],
    )
    return { purgedRows: [], rows }
  })
  const row = transition.rows[0]
  if (!row) {
    throw conflictError('The forensic capture action is not valid now', {
      action: input.action,
      captureWindowId: input.captureWindowId,
    })
  }
  const result = summary(row)
  for (const purgedRow of transition.purgedRows) {
    const purgedCapture = summary(purgedRow)
    recordSecurityEvent({
      actor: {
        hsaId: actor.hsaId,
        source: context.actor.source,
        ...(context.actor.id ? { sub: context.actor.id } : {}),
      },
      detail: {
        action: 'activation_replacement',
        captureWindowId: purgedCapture.id,
        direction: purgedCapture.direction,
        expiresAt: purgedCapture.expiresAt,
        operation: purgedCapture.operation,
      },
      event: 'ai.forensic_evidence.purged',
      outcome: 'success',
      request: context.request ?? {
        method: 'PATCH',
        path: '/api/admin/ai-forensic-captures',
        requestId: context.requestId,
      },
    })
  }
  recordSecurityEvent({
    actor: {
      hsaId: actor.hsaId,
      source: context.actor.source,
      ...(context.actor.id ? { sub: context.actor.id } : {}),
    },
    detail: {
      action: input.action,
      captureWindowId: result.id,
      direction: result.direction,
      expiresAt: result.expiresAt,
      operation: result.operation,
    },
    event: transitionEvent(input.action),
    outcome: 'success',
    request: context.request ?? {
      method: 'PATCH',
      path: '/api/admin/ai-forensic-captures',
      requestId: context.requestId,
    },
  })
  return result
}
