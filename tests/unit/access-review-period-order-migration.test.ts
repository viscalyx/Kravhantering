import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(
    process.cwd(),
    'typeorm',
    'migrations',
    '0047_access_review_period_order.mjs',
  ),
  'utf8',
)

describe('access-review period-order migration', () => {
  it('checks existing and future review periods without changing evidence', () => {
    expect(migrationSource).toContain(
      'WITH CHECK ADD CONSTRAINT [chk_access_review_runs_period_order]',
    )
    expect(migrationSource).toContain('CHECK ([period_start] <= [period_end])')
    expect(migrationSource).not.toContain('NOCHECK')
    expect(migrationSource).not.toContain('UPDATE [access_review_runs]')
  })

  it('removes only the named check constraint on rollback', () => {
    expect(migrationSource).toContain(
      'DROP CONSTRAINT [chk_access_review_runs_period_order]',
    )
  })
})
