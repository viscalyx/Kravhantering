import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addMcpMaxRequestBytesSteps,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import {
  clearMcpMaxRequestBytesCacheForTests,
  formatAiSettingsLoadError,
  getAiGenerationAvailability,
  getAiGenerationSettings,
  getCachedMcpMaxRequestBytes,
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
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })
  })

  it('falls back to the default MCP limit when the migrated column is missing on read', async () => {
    query
      .mockRejectedValueOnce(
        Object.assign(
          new Error("Invalid column name 'mcp_max_request_bytes'."),
          { number: 207 },
        ),
      )
      .mockResolvedValueOnce([{ requirementGenerationEnabled: 0 }])

    await expect(getAiGenerationSettings(db)).resolves.toEqual({
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: false,
    })

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0]).toContain('mcp_max_request_bytes')
    expect(query.mock.calls[1]?.[0]).not.toContain('mcp_max_request_bytes')
  })

  it('falls back to the legacy AI settings read when the current projection fails', async () => {
    query
      .mockRejectedValueOnce(new Error('current projection unavailable'))
      .mockResolvedValueOnce([{ requirementGenerationEnabled: 1 }])

    await expect(getAiGenerationSettings(db)).resolves.toEqual({
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })

    expect(query).toHaveBeenCalledTimes(2)
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
        mcpMaxRequestBytes: configuredLimit,
        requirementGenerationEnabled: 0,
      },
    ])

    await expect(
      getAiGenerationAvailability(db, { NODE_ENV: 'test' }),
    ).resolves.toEqual({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
      mcpMaxRequestBytes: configuredLimit,
      requirementGenerationEnabled: false,
    })
  })

  it('gives the environment guard highest precedence', () => {
    expect(
      resolveAiGenerationAvailability(
        {
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: true,
        },
        { AI_REQUIREMENT_GENERATION_DISABLED: 'true', NODE_ENV: 'test' },
      ),
    ).toEqual({
      disabledByEnvironment: true,
      effectiveRequirementGenerationEnabled: false,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: true,
    })
  })

  it('updates the singleton row and returns effective availability', async () => {
    const audit = vi.fn()

    await expect(
      updateAiGenerationSettings(
        db,
        {
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: false,
        },
        { audit, env: { NODE_ENV: 'test' } },
      ),
    ).resolves.toEqual({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: false,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: false,
    })

    expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_settings'),
      [MCP_REQUEST_PAYLOAD_DEFAULT_BYTES, false, expect.any(String)],
    )
    expect(audit).toHaveBeenCalledWith(manager)
  })

  it('rejects invalid MCP request payload limits before writing', async () => {
    await expect(
      updateAiGenerationSettings(db, {
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
        mcpMaxRequestBytes: configuredLimit,
        requirementGenerationEnabled: 1,
      },
    ])

    await expect(getCachedMcpMaxRequestBytes(db)).resolves.toBe(configuredLimit)
    await expect(getCachedMcpMaxRequestBytes(db)).resolves.toBe(configuredLimit)

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default MCP request payload limit when loading fails', async () => {
    query.mockRejectedValueOnce(new Error('settings unavailable'))

    await expect(getCachedMcpMaxRequestBytes(db)).resolves.toBe(
      MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
    )
  })
})
