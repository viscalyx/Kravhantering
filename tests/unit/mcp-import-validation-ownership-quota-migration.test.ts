import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(
    process.cwd(),
    'typeorm',
    'migrations',
    '0056_mcp_import_validation_ownership_quotas.mjs',
  ),
  'utf8',
)

describe('MCP import-validation ownership and quota migration', () => {
  it('purges legacy sessions before requiring ownership and reservation fields', () => {
    expect(
      migrationSource.indexOf(
        'DELETE FROM [requirement_import_validation_sessions]',
      ),
    ).toBeLessThan(migrationSource.indexOf('creator_principal_fingerprint'))
    expect(migrationSource).toContain(
      'ADD [creator_principal_fingerprint] nvarchar(64) NOT NULL',
    )
    expect(migrationSource).toContain('ADD [reserved_bytes] bigint NOT NULL')
  })

  it('creates bounded principal rate buckets and all four setting constraints', () => {
    expect(migrationSource).toContain(
      'CREATE TABLE [requirement_import_validation_rate_buckets]',
    )
    expect(migrationSource).toContain('successful_creations')
    expect(migrationSource).toContain('window_started_at')
    expect(migrationSource).toContain(
      'mcp_import_max_active_sessions_per_principal',
    )
    expect(migrationSource).toContain(
      'mcp_import_max_active_sessions_per_destination',
    )
    expect(migrationSource).toContain('mcp_import_max_creations_per_window')
    expect(migrationSource).toContain('mcp_import_max_reserved_bytes')
    expect(migrationSource).toContain('% 67108864 = 0')
  })

  it('purges ownership-aware sessions before rollback restores token-only code', () => {
    const downSection = migrationSource.slice(
      migrationSource.indexOf('const DOWN_STATEMENTS'),
    )
    expect(
      downSection.indexOf(
        'DELETE FROM [requirement_import_validation_sessions]',
      ),
    ).toBeLessThan(
      downSection.indexOf('DROP COLUMN [creator_principal_fingerprint]'),
    )
    expect(downSection).toContain(
      'DROP TABLE [requirement_import_validation_rate_buckets]',
    )
  })
})
