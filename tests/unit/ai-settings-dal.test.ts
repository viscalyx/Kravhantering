import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_AI_SETTINGS_CONSTRAINTS,
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  addMcpMaxRequestBytesSteps,
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import {
  clearMcpMaxRequestBytesCacheForTests,
  formatAiSettingsLoadError,
  getAiGenerationAvailability,
  getAiGenerationSettings,
  getCachedMcpMaxRequestBytes,
  getCachedMcpRuntimeSettings,
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
    clearMcpMaxRequestBytesCacheForTests()
    query.mockResolvedValue([])
    manager.query.mockResolvedValue([])
    transaction.mockImplementation(
      async (callback: (executor: typeof manager) => unknown) =>
        callback(manager),
    )
  })

  it('loads the default enabled setting when the singleton row is absent', async () => {
    await expect(getAiGenerationSettings(db)).resolves.toEqual({
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })
  })

  it('falls back to the default MCP limit when the migrated column is missing on read', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    query
      .mockRejectedValueOnce(
        Object.assign(
          new Error("Invalid column name 'mcp_max_request_bytes'."),
          { number: 207 },
        ),
      )
      .mockResolvedValueOnce([{ requirementGenerationEnabled: 0 }])

    try {
      await expect(getAiGenerationSettings(db)).resolves.toEqual({
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: false,
      })

      expect(query).toHaveBeenCalledTimes(2)
      expect(query.mock.calls[0]?.[0]).toContain('mcp_max_request_bytes')
      expect(query.mock.calls[1]?.[0]).not.toContain('mcp_max_request_bytes')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('warns when falling back to the legacy AI settings read unexpectedly', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    query
      .mockRejectedValueOnce(new Error('current projection unavailable'))
      .mockResolvedValueOnce([{ requirementGenerationEnabled: 1 }])

    try {
      await expect(getAiGenerationSettings(db)).resolves.toEqual({
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: true,
      })

      expect(query).toHaveBeenCalledTimes(2)
      expect(warnSpy).toHaveBeenCalledWith(
        'AI settings current projection failed; falling back to legacy settings.',
        expect.objectContaining({
          error: expect.objectContaining({
            messages: expect.arrayContaining([
              'current projection unavailable',
            ]),
          }),
        }),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('formats nested SQL Server load errors as JSON-friendly messages', () => {
    const sqlError = Object.assign(
      new Error("Invalid column name 'mcp_max_request_bytes'."),
      { number: 207 },
    )
    const wrappedError = Object.assign(
      new Error('Failed to load AI settings from the database.'),
      { precedingErrors: [sqlError] },
    )

    const formatted = formatAiSettingsLoadError(wrappedError)

    expect(formatted).toMatchObject({
      message: 'Failed to load AI settings from the database.',
      messages: expect.arrayContaining([
        'Failed to load AI settings from the database.',
        "Invalid column name 'mcp_max_request_bytes'.",
        '207',
      ]),
      stack: expect.any(String),
    })
    expect(JSON.stringify(formatted)).toContain('mcp_max_request_bytes')
  })

  it('maps the stored bit to effective availability', async () => {
    const configuredLimit = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      1,
    )
    query.mockResolvedValueOnce([
      {
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: configuredLimit,
        requirementGenerationEnabled: 0,
      },
    ])

    await expect(
      getAiGenerationAvailability(db, { NODE_ENV: 'test' }),
    ).resolves.toEqual({
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
      requirementGenerationEnabled: false,
    })
  })

  it('gives the environment guard highest precedence', () => {
    expect(
      resolveAiGenerationAvailability(
        {
          aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
          mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
          mcpImportValidationTtlMinutes:
            MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: true,
        },
        { AI_REQUIREMENT_GENERATION_DISABLED: 'true', NODE_ENV: 'test' },
      ),
    ).toEqual({
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
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
        {
          aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
          mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
          mcpImportValidationTtlMinutes:
            MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: false,
        },
        { audit, env: { NODE_ENV: 'test' } },
      ),
    ).resolves.toEqual({
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: false,
    })

    expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_settings'),
      [
        AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        MCP_IMPORT_MAX_ROWS_DEFAULT,
        MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        false,
        expect.any(String),
      ],
    )
    expect(audit).toHaveBeenCalledWith(manager)
  })

  it('rejects invalid MCP request payload limits before writing', async () => {
    await expect(
      updateAiGenerationSettings(db, {
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES + 1,
        requirementGenerationEnabled: true,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_mcp_max_request_bytes' },
    })

    expect(transaction).not.toHaveBeenCalled()
  })

  it('caches the configured MCP request payload limit', async () => {
    const configuredLimit = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      1,
    )
    query.mockResolvedValueOnce([
      {
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: configuredLimit,
        requirementGenerationEnabled: 1,
      },
    ])

    await expect(getCachedMcpMaxRequestBytes(db)).resolves.toBe(configuredLimit)
    await expect(getCachedMcpMaxRequestBytes(db)).resolves.toBe(configuredLimit)

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('falls back to default MCP runtime settings when the singleton row is absent', async () => {
    await expect(getCachedMcpRuntimeSettings(db)).resolves.toEqual({
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    })
    await expect(getCachedMcpRuntimeSettings(db)).resolves.toEqual({
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    })

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('fails closed when runtime MCP settings cannot be loaded', async () => {
    query.mockRejectedValueOnce(new Error('settings unavailable'))

    await expect(getCachedMcpRuntimeSettings(db)).rejects.toThrow(
      'settings unavailable',
    )
  })
})
