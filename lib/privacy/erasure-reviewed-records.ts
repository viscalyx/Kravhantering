import type { PrivacyGroupPolicy } from './erasure'

const PERSON_COLUMNS =
  'hsa_id, given_name, middle_name, surname, email, has_protected_personal_data'
const EVIDENCE_COLUMNS = `CAST(id AS varchar(20)) AS id, ai_forensic_capture_window_id,
  event_id, actor_fingerprint, blocked_step, primary_rule_id, rule_ids_json,
  CONVERT(varchar(64), HASHBYTES('SHA2_256', evidence_json), 2) AS evidence_hash,
  item_count, byte_count, captured_at`

// Select the identities and values the erasure writes or deletes. Keep business
// content that anonymization preserves out of the proof. Evidence stays in SQL.
const SPECIAL_COLUMNS: Record<string, string> = {
  'requirement_responsibility_people.identity': PERSON_COLUMNS,
  'requirement_areas.owner': 'id, owner_hsa_id',
  'requirement_packages.owner': 'id, lead_hsa_id',
  'ai_forensic_capture_windows.identity': `id, requested_by_hsa_id, requested_by_display_name,
    approved_by_hsa_id, approved_by_display_name, stopped_by_hsa_id, stopped_by_display_name,
    purged_by_hsa_id, purged_by_display_name, stopped_at, purged_at, is_open`,
  'ai_forensic_evidence_events.actor_fingerprint': EVIDENCE_COLUMNS,
  'hsa_verification_quota_buckets.subject': `id, bucket_kind, actor_fingerprint,
    target_fingerprint, actor_subject_fingerprint, request_count, window_started_at, expires_at`,
  'export_actor_quota_entries.subject':
    'id, actor_fingerprint, created_at, released_at, expires_at',
  'requirement_import_validation_sessions.creator': `id, creator_principal_fingerprint,
    token_hash, payload_hash, destination_kind, destination_id, reference_data_fingerprint,
    CONVERT(varchar(64), HASHBYTES('SHA2_256', destination_snapshot_json), 2) AS destination_hash,
    CONVERT(varchar(64), HASHBYTES('SHA2_256', submitted_payload_json), 2) AS submitted_hash,
    CONVERT(varchar(64), HASHBYTES('SHA2_256', validation_result_json), 2) AS validation_hash,
    CONVERT(varchar(64), HASHBYTES('SHA2_256', execution_result_json), 2) AS execution_hash,
    reserved_bytes, expires_at`,
  'requirement_import_validation_rate_buckets.principal': `id, principal_fingerprint,
    window_started_at, successful_creations, expires_at`,
}

const CO_AUTHOR_KEYS: Record<string, string> = {
  requirement_area_co_authors: 'area_id',
  requirement_package_co_authors: 'requirement_package_id',
  specification_co_authors: 'specification_id',
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

function stableRows(rows: Record<string, unknown>[]): string[] {
  return rows
    .map(row =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      ),
    )
    .sort()
}

export async function reviewedPrivacyRecords(
  db: QueryExecutor,
  policy: PrivacyGroupPolicy,
  targetValue: string,
  displayColumn: string | null,
): Promise<string[]> {
  const coAuthorKey = CO_AUTHOR_KEYS[policy.table ?? '']
  const columns =
    SPECIAL_COLUMNS[policy.key] ??
    (coAuthorKey
      ? `${coAuthorKey}, hsa_id, created_by_hsa_id, created_by_display_name, created_at`
      : ['CAST(id AS varchar(20)) AS id', policy.hsaColumn, displayColumn]
          .filter(Boolean)
          .join(', '))
  // Reuse the policy's exact predicate, including fingerprint and OR matches.
  const sql = policy.countSql.replace('COUNT(*) AS count', columns)
  const records = stableRows(
    await db.query<Record<string, unknown>[]>(sql, [targetValue]),
  )
  if (policy.kind === 'aiForensicCaptureIdentity') {
    const captures = policy.countSql.replace('COUNT(*) AS count', 'id')
    const evidence = await db.query<Record<string, unknown>[]>(
      `SELECT ${EVIDENCE_COLUMNS} FROM ai_forensic_evidence_events
       WHERE ai_forensic_capture_window_id IN (${captures})`,
      [targetValue],
    )
    records.push(...stableRows(evidence))
  }
  return records
}

export async function reviewedReplacementPerson(
  db: QueryExecutor,
  hsaId: string,
): Promise<string[]> {
  return stableRows(
    await db.query<Record<string, unknown>[]>(
      `SELECT ${PERSON_COLUMNS} FROM requirement_responsibility_people WHERE hsa_id = @0`,
      [hsaId],
    ),
  )
}
