import { describe, expect, it } from 'vitest'
import {
  buildRuntimePermissionReconcileSql,
  RUNTIME_PERMISSION_MANIFEST,
  RUNTIME_PERMISSION_MANIFEST_AT_0054,
  RUNTIME_PERMISSION_MANIFEST_DIGEST,
  RUNTIME_PERMISSION_MANIFEST_VERSION,
} from '@/typeorm/runtime-permission-manifest.mjs'

function permissionFor(objectName: string) {
  return RUNTIME_PERMISSION_MANIFEST.find(entry => entry.object === objectName)
}

describe('runtime permission manifest', () => {
  it('is release-versioned, stable, and explicit about protected objects', () => {
    expect(RUNTIME_PERMISSION_MANIFEST_VERSION).toMatch(/^2026\.09\.04\./u)
    expect(RUNTIME_PERMISSION_MANIFEST_DIGEST).toMatch(/^[a-f0-9]{64}$/u)
    expect(RUNTIME_PERMISSION_MANIFEST.map(entry => entry.object)).toEqual(
      [...RUNTIME_PERMISSION_MANIFEST]
        .map(entry => entry.object)
        .sort((left, right) => left.localeCompare(right)),
    )
    expect(permissionFor('dbo.migrations')).toEqual({
      object: 'dbo.migrations',
      permissions: ['SELECT'],
    })
    expect(permissionFor('dbo.action_audit_events')).toEqual({
      object: 'dbo.action_audit_events',
      permissions: ['SELECT', 'INSERT'],
      updateColumns: ['actor_hsa_id', 'actor_display_name'],
    })
    expect(permissionFor('dbo.archiving_retention_runs')).toEqual({
      object: 'dbo.archiving_retention_runs',
      permissions: ['SELECT', 'INSERT'],
    })
    expect(permissionFor('dbo.ai_forensic_capture_windows')).toEqual({
      object: 'dbo.ai_forensic_capture_windows',
      permissions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    })
    expect(permissionFor('dbo.ai_forensic_evidence_events')).toEqual({
      object: 'dbo.ai_forensic_evidence_events',
      permissions: ['SELECT', 'INSERT', 'DELETE'],
    })
    expect(
      permissionFor('dbo.ai_connection_model_verification_evidence'),
    ).toEqual({
      object: 'dbo.ai_connection_model_verification_evidence',
      permissions: ['SELECT', 'INSERT', 'DELETE'],
    })
    expect(permissionFor('dbo.ai_provider_secret_versions')).toEqual({
      object: 'dbo.ai_provider_secret_versions',
      permissions: ['SELECT', 'INSERT', 'DELETE'],
      updateColumns: [
        'status',
        'ciphertext',
        'nonce',
        'authentication_tag',
        'cipher_format_version',
        'root_key_version',
        'verified_at',
        'activated_at',
        'deactivated_at',
        'provider_revoked_at',
        'ciphertext_deleted_at',
        'revision_token',
      ],
    })
    expect(permissionFor('dbo.ai_run_coordination_entries')).toEqual({
      object: 'dbo.ai_run_coordination_entries',
      permissions: ['SELECT', 'INSERT', 'DELETE'],
      updateColumns: [
        'status',
        'attempt_count',
        'not_before',
        'lease_owner_id',
        'lease_expires_at',
        'cancellation_requested_at',
        'cancellation_reason',
        'updated_at',
      ],
    })
    expect(
      permissionFor('dbo.requirement_import_validation_rate_buckets'),
    ).toEqual({
      object: 'dbo.requirement_import_validation_rate_buckets',
      permissions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    })
    expect(permissionFor('dbo.hsa_verification_quota_buckets')).toEqual({
      object: 'dbo.hsa_verification_quota_buckets',
      permissions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    })
    const aiSettingsPermission = permissionFor('dbo.ai_settings')
    expect(
      aiSettingsPermission && 'updateColumns' in aiSettingsPermission
        ? aiSettingsPermission.updateColumns
        : undefined,
    ).toEqual(
      expect.arrayContaining([
        'mcp_import_max_active_sessions_per_destination',
        'mcp_import_max_active_sessions_per_principal',
        'mcp_import_max_creations_per_window',
        'mcp_import_max_reserved_bytes',
      ]),
    )
    expect(
      aiSettingsPermission && 'updateColumns' in aiSettingsPermission
        ? aiSettingsPermission.updateColumns
        : undefined,
    ).not.toContain('ai_safety_forensic_logging_enabled')
  })

  it('builds reconciliation from explicit objects without schema-wide or dynamic grants', () => {
    const sql = buildRuntimePermissionReconcileSql()

    expect(sql).toContain('REVOKE SELECT ON OBJECT::[dbo].[migrations]')
    expect(sql).toContain('GRANT SELECT ON OBJECT::[dbo].[migrations]')
    expect(sql).toContain(
      'GRANT UPDATE ([actor_hsa_id], [actor_display_name]) ON OBJECT::[dbo].[action_audit_events]',
    )
    expect(sql).not.toContain('GRANT SELECT ON SCHEMA::')
    expect(sql).not.toContain('GRANT INSERT ON SCHEMA::')
    expect(sql).not.toContain('FROM sys.tables')
    expect(sql).not.toContain(
      'GRANT DELETE ON OBJECT::[dbo].[action_audit_events]',
    )
    expect(sql).toContain("WHEN 4 THEN N'REVOKE '")
    expect(sql).toContain("ELSE N'USER::'")
    expect(sql).toContain(
      "ELSE N'THROW 51023, ''Runtime role contains an unsupported direct permission class.'', 1;'",
    )
    expect(sql).toContain('requirement_import_validation_rate_buckets')
    expect(sql).toContain('mcp_import_max_reserved_bytes')
  })

  it('keeps the migration 0054 permission snapshot historical', () => {
    const sql = buildRuntimePermissionReconcileSql(
      RUNTIME_PERMISSION_MANIFEST_AT_0054,
    )

    expect(sql).not.toContain('requirement_import_validation_rate_buckets')
    expect(sql).not.toContain('mcp_import_max_reserved_bytes')
  })
})
