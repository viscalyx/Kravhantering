import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(
    process.cwd(),
    'typeorm',
    'migrations',
    '0049_rfi_question_suggestion_lifecycle.mjs',
  ),
  'utf8',
)

describe('RFI question suggestion lifecycle migration', () => {
  it('adds a checked lifecycle invariant', () => {
    expect(migrationSource).toContain(
      'WITH CHECK ADD CONSTRAINT [chk_rfi_question_suggestions_lifecycle]',
    )
    expect(migrationSource).not.toContain('NOCHECK')
    expect(migrationSource).not.toContain('Cannot enforce RFI question')
  })

  it('uses one set-based trigger for inserts, transitions, evidence, and deletion', () => {
    expect(migrationSource).toContain(
      'CREATE OR ALTER TRIGGER [trg_rfi_question_suggestions_lifecycle]',
    )
    expect(migrationSource).toContain('AFTER INSERT, UPDATE, DELETE')
    expect(migrationSource).toContain('FROM inserted AS inserted_row')
    expect(migrationSource).toContain('FROM deleted AS deleted_row')
    expect(migrationSource).not.toMatch(/\bCURSOR\b/u)
  })

  it('restores the former resolution check on rollback', () => {
    expect(migrationSource).toContain(
      'DROP CONSTRAINT [chk_rfi_question_suggestions_lifecycle]',
    )
    expect(migrationSource).toContain(
      'WITH CHECK ADD CONSTRAINT [chk_rfi_question_suggestions_resolution]',
    )
  })
})
