import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(process.cwd(), 'typeorm', 'migrations', '0032_hsa_id_prefixes.mjs'),
  'utf8',
)

describe('HSA-id prefix migration', () => {
  it('backfills from active responsibility assignments only', () => {
    for (const column of [
      '[owner_hsa_id]',
      '[hsa_id]',
      '[responsible_hsa_id]',
      '[lead_hsa_id]',
    ]) {
      expect(migrationSource).toContain(column)
    }

    expect(migrationSource).toContain('FROM [requirement_areas]')
    expect(migrationSource).toContain('FROM [requirement_area_co_authors]')
    expect(migrationSource).toContain('FROM [requirements_specifications]')
    expect(migrationSource).toContain('FROM [specification_co_authors]')
    expect(migrationSource).toContain('FROM [requirement_packages]')
    expect(migrationSource).toContain('FROM [requirement_package_co_authors]')
    expect(migrationSource).not.toContain('[created_by_hsa_id] AS [hsa_id]')
  })

  it('requires a full syntactic HSA-id before extracting the prefix', () => {
    expect(migrationSource).toContain(
      "LIKE N'[A-Z][A-Z][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-%'",
    )
    expect(migrationSource).toContain('LEN(hsa_record.[hsa_id]) > 13')
    expect(migrationSource).toContain(
      "PATINDEX(N'%[^A-Za-z0-9]%', SUBSTRING(hsa_record.[hsa_id], 14, 64)",
    )
    expect(migrationSource).toContain(
      'LEFT(hsa_record.[hsa_id], 12) AS [prefix]',
    )
  })

  it('chooses the default by usage count and alphabetic tie-break', () => {
    expect(migrationSource).toContain(
      'ORDER BY [usage_count] DESC, [prefix] ASC',
    )
    expect(migrationSource).toContain('CROSS JOIN default_prefix')
  })
})
