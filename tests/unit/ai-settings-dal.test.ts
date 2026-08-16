import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_AI_SETTINGS_CONSTRAINTS,
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  addMcpMaxRequestBytesSteps,
  MCP_IMPORT_MAX_ACTIVE_SESSIONS_PER_DESTINATION_DEFAULT,
  MCP_IMPORT_MAX_ACTIVE_SESSIONS_PER_PRINCIPAL_DEFAULT,
  MCP_IMPORT_MAX_CREATIONS_PER_WINDOW_DEFAULT,
  MCP_IMPORT_MAX_RESERVED_BYTES_DEFAULT,
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import {
  clearMcpMaxRequestBytesCacheForTests,
  formatAiSettingsLoadError,
  getAdminAiSettings,
  getAiGenerationAvailability,
  getAiGenerationSettings,
  getCachedMcpMaxRequestBytes,
  getCachedMcpRuntimeSettings,
  patchAiGenerationSettings,
  resolveAiGenerationAvailability,
  updateAiGenerationSettings,
} from '@/lib/dal/ai-settings'
import type { SqlServerDatabase } from '@/lib/db'

const MCP_QUOTA_DEFAULTS = {
  mcpImportMaxActiveSessionsPerDestination:
    MCP_IMPORT_MAX_ACTIVE_SESSIONS_PER_DESTINATION_DEFAULT,
  mcpImportMaxActiveSessionsPerPrincipal:
    MCP_IMPORT_MAX_ACTIVE_SESSIONS_PER_PRINCIPAL_DEFAULT,
  mcpImportMaxCreationsPerWindow: MCP_IMPORT_MAX_CREATIONS_PER_WINDOW_DEFAULT,
  mcpImportMaxReservedBytes: MCP_IMPORT_MAX_RESERVED_BYTES_DEFAULT,
}

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

  it('loads the remaining defaults when the singleton row is absent', async () => {
    await expect(getAiGenerationSettings(db)).resolves.toEqual({
      ...MCP_QUOTA_DEFAULTS,
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })
  })

  it('loads a saved requirement-generation preference', async () => {
    query.mockResolvedValueOnce([
      {
        requirementGenerationEnabled: 1,
      },
    ])

    await expect(getAiGenerationSettings(db)).resolves.toMatchObject({
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
        ...MCP_QUOTA_DEFAULTS,
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
        ...MCP_QUOTA_DEFAULTS,
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
        ...MCP_QUOTA_DEFAULTS,
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
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
    })
  })

  it('maps a complete current row and defaults invalid migrated values', async () => {
    query.mockResolvedValueOnce([
      {
        aiSafetyRuleCacheTtlSeconds: -1,
        mcpImportMaxActiveSessionsPerDestination: -1,
        mcpImportMaxActiveSessionsPerPrincipal: -1,
        mcpImportMaxCreationsPerWindow: -1,
        mcpImportMaxRows: -1,
        mcpImportMaxReservedBytes: -1,
        mcpImportValidationTtlMinutes: -1,
        mcpMaxRequestBytes: -1,
        requirementGenerationEnabled: 1,
      },
    ])

    await expect(getAdminAiSettings(db, { NODE_ENV: 'test' })).resolves.toEqual(
      {
        ...MCP_QUOTA_DEFAULTS,
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
        disabledByEnvironment: false,
        effectiveRequirementGenerationEnabled: true,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: true,
      },
    )
  })

  it('uses MCP defaults when a newer MCP migration is absent', async () => {
    query
      .mockRejectedValueOnce(
        Object.assign(new Error("Invalid column name 'mcp_import_max_rows'."), {
          number: 207,
        }),
      )
      .mockResolvedValueOnce([
        {
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: 1,
        },
      ])

    await expect(getAiGenerationSettings(db)).resolves.toMatchObject({
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      requirementGenerationEnabled: true,
    })
  })

  it('uses quota defaults when the principal quota migration is absent', async () => {
    query
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            "Invalid column name 'mcp_import_max_active_sessions_per_principal'.",
          ),
          { number: 207 },
        ),
      )
      .mockResolvedValueOnce([
        {
          aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
          mcpImportMaxRows: 321,
          mcpImportValidationTtlMinutes: 45,
          mcpMaxRequestBytes: 2 * 1024 * 1024,
          requirementGenerationEnabled: 0,
        },
      ])

    await expect(getAiGenerationSettings(db)).resolves.toMatchObject({
      ...MCP_QUOTA_DEFAULTS,
      mcpImportMaxRows: 321,
      mcpImportValidationTtlMinutes: 45,
      mcpMaxRequestBytes: 2 * 1024 * 1024,
      requirementGenerationEnabled: false,
    })
    expect(query.mock.calls[1]?.[0]).not.toContain(
      'mcp_import_max_active_sessions_per_principal',
    )
  })

  it('uses complete defaults when the quota compatibility row is absent', async () => {
    query
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            "Invalid column name 'mcp_import_max_active_sessions_per_destination'.",
          ),
          { number: 207 },
        ),
      )
      .mockResolvedValueOnce([])

    await expect(getAiGenerationSettings(db)).resolves.toEqual({
      ...MCP_QUOTA_DEFAULTS,
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })
  })

  it('falls through to the legacy projection when an intermediate fallback fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    query
      .mockRejectedValueOnce(new Error('current projection failed'))
      .mockRejectedValueOnce(new Error('MCP compatibility failed'))
      .mockResolvedValueOnce([{ requirementGenerationEnabled: 0 }])

    try {
      await expect(getAiGenerationSettings(db)).resolves.toMatchObject({
        requirementGenerationEnabled: false,
      })
      expect(query).toHaveBeenCalledTimes(3)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('retains all database errors when every compatibility projection fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    query
      .mockRejectedValueOnce(new Error('current projection failed'))
      .mockRejectedValueOnce(new Error('compatibility projection failed'))
      .mockRejectedValueOnce(new Error('legacy projection failed'))

    try {
      await expect(getAiGenerationSettings(db)).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: 'current projection failed',
        }),
        fallbackError: expect.objectContaining({
          message: 'compatibility projection failed',
        }),
        legacyFallbackError: expect.objectContaining({
          message: 'legacy projection failed',
        }),
      })
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('gives the environment guard highest precedence', () => {
    expect(
      resolveAiGenerationAvailability(
        {
          ...MCP_QUOTA_DEFAULTS,
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
      disabledByEnvironment: true,
      effectiveRequirementGenerationEnabled: false,
    })
  })

  it('updates the singleton row and returns full Admin settings', async () => {
    const audit = vi.fn()
    manager.query
      .mockResolvedValueOnce([
        { requirementImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT },
      ])
      .mockResolvedValueOnce([{ id: 1 }])

    await expect(
      updateAiGenerationSettings(
        db,
        {
          ...MCP_QUOTA_DEFAULTS,
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
      ...MCP_QUOTA_DEFAULTS,
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
        MCP_IMPORT_MAX_ACTIVE_SESSIONS_PER_DESTINATION_DEFAULT,
        MCP_IMPORT_MAX_ACTIVE_SESSIONS_PER_PRINCIPAL_DEFAULT,
        MCP_IMPORT_MAX_CREATIONS_PER_WINDOW_DEFAULT,
        MCP_IMPORT_MAX_RESERVED_BYTES_DEFAULT,
        MCP_IMPORT_MAX_ROWS_DEFAULT,
        MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        false,
        expect.any(String),
      ],
    )
    expect(audit).toHaveBeenCalledWith(manager)
  })

  it('fails clearly when the migration-owned singleton row is missing', async () => {
    manager.query
      .mockResolvedValueOnce([
        { requirementImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT },
      ])
      .mockResolvedValueOnce([])

    await expect(
      updateAiGenerationSettings(db, {
        ...MCP_QUOTA_DEFAULTS,
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: true,
      }),
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      details: { reason: 'ai_settings_database_drift' },
    })
    expect(String(manager.query.mock.calls[0]?.[0])).not.toContain(
      'IDENTITY_INSERT',
    )
  })

  it('rejects invalid MCP request payload limits before writing', async () => {
    await expect(
      updateAiGenerationSettings(db, {
        ...MCP_QUOTA_DEFAULTS,
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

  it('locks and enforces the global import row limit before updating AI settings', async () => {
    manager.query.mockResolvedValueOnce([{ requirementImportMaxRows: 250 }])

    await expect(
      updateAiGenerationSettings(db, {
        ...MCP_QUOTA_DEFAULTS,
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: 251,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: true,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'mcp_import_max_rows_exceeds_global_limit' },
    })
    expect(manager.query.mock.calls[0]?.[0]).toContain('UPDLOCK, HOLDLOCK')
    expect(manager.query).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the locked global import row limit is missing', async () => {
    manager.query.mockResolvedValueOnce([])

    await expect(
      updateAiGenerationSettings(db, {
        ...MCP_QUOTA_DEFAULTS,
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: true,
      }),
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      details: { reason: 'application_settings_database_drift' },
    })
    expect(manager.query.mock.calls[0]?.[0]).toContain('UPDLOCK, HOLDLOCK')
  })

  it.each([
    [
      'mcpImportMaxActiveSessionsPerPrincipal',
      -1,
      'invalid_mcp_import_max_active_sessions_per_principal',
    ],
    [
      'mcpImportMaxActiveSessionsPerDestination',
      -1,
      'invalid_mcp_import_max_active_sessions_per_destination',
    ],
    [
      'mcpImportMaxCreationsPerWindow',
      -1,
      'invalid_mcp_import_max_creations_per_window',
    ],
    ['mcpImportMaxReservedBytes', -1, 'invalid_mcp_import_max_reserved_bytes'],
    ['mcpImportMaxRows', -1, 'invalid_mcp_import_max_rows'],
    [
      'mcpImportValidationTtlMinutes',
      -1,
      'invalid_mcp_import_validation_ttl_minutes',
    ],
    [
      'aiSafetyRuleCacheTtlSeconds',
      -1,
      'invalid_ai_safety_rule_cache_ttl_seconds',
    ],
  ])('rejects invalid %s before writing', async (field, value, reason) => {
    await expect(
      updateAiGenerationSettings(db, {
        ...MCP_QUOTA_DEFAULTS,
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: true,
        [field]: value,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason },
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('patches only supplied values through the atomic full-row update', async () => {
    query.mockResolvedValueOnce([
      {
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: 1,
      },
    ])
    manager.query
      .mockResolvedValueOnce([
        { requirementImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT },
      ])
      .mockResolvedValueOnce([{ id: 1 }])

    await expect(
      patchAiGenerationSettings(
        db,
        { aiSafetyRuleCacheTtlSeconds: 601 },
        { env: { NODE_ENV: 'test' } },
      ),
    ).resolves.toMatchObject({
      aiSafetyRuleCacheTtlSeconds: 601,
      requirementGenerationEnabled: true,
    })
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_settings'),
      expect.arrayContaining([601]),
    )
  })

  it('caches the configured MCP request payload limit', async () => {
    const configuredLimit = addMcpMaxRequestBytesSteps(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      1,
    )
    query.mockResolvedValueOnce([
      {
        ...MCP_QUOTA_DEFAULTS,
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
      ...MCP_QUOTA_DEFAULTS,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    })
    await expect(getCachedMcpRuntimeSettings(db)).resolves.toEqual({
      ...MCP_QUOTA_DEFAULTS,
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

  it.each([
    [
      { mcpImportMaxActiveSessionsPerPrincipal: -1 },
      'invalid_mcp_import_max_active_sessions_per_principal',
    ],
    [
      { mcpImportMaxActiveSessionsPerDestination: -1 },
      'invalid_mcp_import_max_active_sessions_per_destination',
    ],
    [
      { mcpImportMaxCreationsPerWindow: -1 },
      'invalid_mcp_import_max_creations_per_window',
    ],
    [
      { mcpImportMaxReservedBytes: -1 },
      'invalid_mcp_import_max_reserved_bytes',
    ],
    [{ mcpImportMaxRows: -1 }, 'invalid_mcp_import_max_rows'],
    [
      { mcpImportValidationTtlMinutes: -1 },
      'invalid_mcp_import_validation_ttl_minutes',
    ],
  ])(
    'rejects invalid persisted MCP runtime settings',
    async (override, reason) => {
      query.mockResolvedValueOnce([
        {
          ...MCP_QUOTA_DEFAULTS,
          mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
          mcpImportValidationTtlMinutes:
            MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          ...override,
        },
      ])

      await expect(getCachedMcpRuntimeSettings(db)).rejects.toMatchObject({
        code: 'validation',
        details: { reason },
      })
    },
  )

  it('formats non-Error and cyclic error details without recursion', () => {
    const cyclic: { message: string; primaryError?: unknown } = {
      message: 'outer failure',
    }
    cyclic.primaryError = cyclic

    expect(formatAiSettingsLoadError(cyclic)).toEqual({
      message: 'outer failure',
      messages: ['outer failure'],
    })
    expect(formatAiSettingsLoadError(['first', { number: 207 }])).toEqual({
      message: 'first',
      messages: ['first', '207'],
    })
  })
})
