import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSource = readFileSync(
  join(process.cwd(), 'typeorm', 'migrations', '0038_priority_levels.mjs'),
  'utf8',
)

describe('priority-levels migration rollback', () => {
  it('refuses rollback when P1 or P5 values would be lost', () => {
    expect(migrationSource).toContain('[priority_level_id] IN (1, 5)')
    expect(migrationSource).toContain(
      'Cannot roll back priority levels while specification-local requirements use P1 or P5 values.',
    )
    expect(migrationSource).toContain(
      'Cannot roll back priority levels while requirement versions use P1 or P5 values.',
    )
  })
})
