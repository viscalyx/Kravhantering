import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(
    process.cwd(),
    'typeorm',
    'migrations',
    '0044_mcp_import_validation_sessions.mjs',
  ),
  'utf8',
)

describe('MCP import validation sessions migration', () => {
  it('rounds existing MCP request limits to valid whole-MiB bounds', () => {
    expect(migrationSource).toContain(
      'WHEN [mcp_max_request_bytes] < 1048576 THEN 1048576',
    )
    expect(migrationSource).toContain(
      'WHEN [mcp_max_request_bytes] > 10485760 THEN 10485760',
    )
    expect(migrationSource).toContain(
      'ELSE (([mcp_max_request_bytes] + 524288) / 1048576) * 1048576',
    )
    expect(migrationSource).not.toContain(
      'SET [mcp_max_request_bytes] = 10485760',
    )
  })
})
