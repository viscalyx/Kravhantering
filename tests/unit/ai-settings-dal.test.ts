import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAiGenerationAvailability,
  getAiGenerationSettings,
  resolveAiGenerationAvailability,
  updateAiGenerationSettings,
} from '@/lib/dal/ai-settings'
import type { SqlServerDatabase } from '@/lib/db'

describe('AI settings DAL', () => {
  const query = vi.fn()
  const transaction = vi.fn()
  const manager = { query: vi.fn() }
  const db = {
    query,
    transaction,
  } as unknown as SqlServerDatabase

  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue([])
    manager.query.mockResolvedValue([])
    transaction.mockImplementation(
      async (callback: (executor: typeof manager) => unknown) =>
        callback(manager),
    )
  })

  it('loads the default enabled setting when the singleton row is absent', async () => {
    await expect(getAiGenerationSettings(db)).resolves.toEqual({
      requirementGenerationEnabled: true,
    })
  })

  it('maps the stored bit to effective availability', async () => {
    query.mockResolvedValueOnce([{ requirementGenerationEnabled: 0 }])

    await expect(
      getAiGenerationAvailability(db, { NODE_ENV: 'test' }),
    ).resolves.toEqual({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
      requirementGenerationEnabled: false,
    })
  })

  it('gives the environment guard highest precedence', () => {
    expect(
      resolveAiGenerationAvailability(
        { requirementGenerationEnabled: true },
        { AI_REQUIREMENT_GENERATION_DISABLED: 'true', NODE_ENV: 'test' },
      ),
    ).toEqual({
      disabledByEnvironment: true,
      effectiveRequirementGenerationEnabled: false,
      requirementGenerationEnabled: true,
    })
  })

  it('updates the singleton row and returns effective availability', async () => {
    const audit = vi.fn()

    await expect(
      updateAiGenerationSettings(
        db,
        { requirementGenerationEnabled: false },
        { audit, env: { NODE_ENV: 'test' } },
      ),
    ).resolves.toEqual({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
      requirementGenerationEnabled: false,
    })

    expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_settings'),
      [false, expect.any(String)],
    )
    expect(audit).toHaveBeenCalledWith(manager)
  })
})
