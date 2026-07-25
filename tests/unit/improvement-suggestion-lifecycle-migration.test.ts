import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(
    process.cwd(),
    'typeorm',
    'migrations',
    '0052_improvement_suggestion_lifecycle.mjs',
  ),
  'utf8',
)

describe('Improvement suggestion lifecycle migration', () => {
  it('normalizes incoherent rows before adding a checked invariant', () => {
    const normalizationPosition = migrationSource.indexOf(
      'UPDATE [improvement_suggestions]',
    )
    const constraintPosition = migrationSource.indexOf(
      'WITH CHECK ADD CONSTRAINT [chk_improvement_suggestions_lifecycle]',
    )

    expect(normalizationPosition).toBeGreaterThan(-1)
    expect(constraintPosition).toBeGreaterThan(normalizationPosition)
    expect(migrationSource).not.toContain('NOCHECK')
    expect(migrationSource).not.toContain('THROW')
  })

  it('retains only complete handled evidence and never invents missing values', () => {
    expect(migrationSource).toContain('[resolution] IN (1, 2)')
    expect(migrationSource).toContain(
      "NULLIF(LTRIM(RTRIM([resolution_motivation])), N'') IS NOT NULL",
    )
    expect(migrationSource).toContain('[resolved_at] >= [review_requested_at]')
    expect(migrationSource).toContain('[resolution] = NULL')
    expect(migrationSource).toContain('[review_requested_at] = NULL')
    expect(migrationSource).not.toMatch(
      /SET \[resolution_motivation\] = N'[^']+'/u,
    )
  })

  it('allows resolver identity snapshots to be erased after handling', () => {
    const handledInvariant = migrationSource.slice(
      migrationSource.indexOf('[resolution] IN (1, 2)'),
      migrationSource.indexOf('const UP_STATEMENTS'),
    )

    expect(handledInvariant).not.toContain('[resolved_by] IS NOT NULL')
    expect(handledInvariant).not.toContain('[resolved_by_hsa_id] IS NOT NULL')
  })

  it('adds no lifecycle trigger and removes the constraint on rollback', () => {
    expect(migrationSource).not.toContain('CREATE TRIGGER')
    expect(migrationSource).not.toContain('CREATE OR ALTER TRIGGER')
    expect(migrationSource).toContain(
      'DROP CONSTRAINT [chk_improvement_suggestions_lifecycle]',
    )
  })
})
