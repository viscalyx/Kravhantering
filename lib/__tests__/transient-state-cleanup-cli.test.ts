import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  runTransientCleanupCommand,
  setTransientCleanupProcessExitCode,
} from '@/lib/transient-cleanup/cli'
import type { TransientCleanupTarget } from '@/lib/transient-cleanup/runner'
import { createSqlServerDataSource } from '@/lib/typeorm/sqlserver-config'

vi.mock('@/lib/typeorm/sqlserver-config', () => ({
  createSqlServerDataSource: vi.fn(),
}))

function target(rows: number): TransientCleanupTarget {
  let remaining = rows
  return {
    kind: 'requirement_import_validation_sessions',
    async inspect() {
      return {
        expiredRowCount: remaining,
        expiredStoredBytes: remaining * 128,
        oldestExpiredAgeMs: remaining > 0 ? 30_000 : null,
      }
    },
    async purgeBatch(limit) {
      const deletedRows = Math.min(limit, remaining)
      remaining -= deletedRows
      return { deletedRows }
    },
  }
}

function compatibilityContract() {
  const imageId = `sha256:${'a'.repeat(64)}`
  return {
    schemaVersion: 1,
    imageId,
    manifestDigest: `sha256:${'b'.repeat(64)}`,
    target: { release: '2.0.0', schemaVersion: 'Schema123' },
    sources: [],
    verification: [
      {
        schemaVersion: 'Schema123',
        schemaFingerprint: createHash('sha256').update('[]').digest('hex'),
        imageId,
        outcome: 'success',
        targets: [
          'ai_run_coordination_entries',
          'ai_forensic_evidence',
          'hsa_verification_quota_buckets',
          'requirement_import_validation_sessions',
          'requirement_import_validation_rate_buckets',
        ].map(kind => ({ kind, outcome: 'success' })),
      },
    ],
  }
}

describe('transient cleanup command', () => {
  it('validates release contracts without connecting to the database', async () => {
    const connect = vi.fn()
    const output: string[] = []
    expect(
      await runTransientCleanupCommand(
        ['--validate-contract', '/contract.json'],
        {
          readContract: async () => compatibilityContract(),
          connect,
          write: line => output.push(line),
        },
      ),
    ).toBe(0)
    expect(connect).not.toHaveBeenCalled()
    expect(JSON.parse(output[0]).outcome).toBe('success')
    expect(
      await runTransientCleanupCommand(
        ['--validate-contract', '/contract.json'],
        {
          readContract: async () => ({ schemaVersion: 2 }),
          connect,
          write: line => output.push(line),
        },
      ),
    ).toBe(1)
    expect(connect).not.toHaveBeenCalled()
  })

  it.each(['Schema123', 'Unverified124'])(
    'gates cleanup on the verified schema head %s',
    async schema => {
      const output: string[] = []
      const createTargets = vi.fn(() => [target(1)])
      const code = await runTransientCleanupCommand(
        ['--contract', '/contract.json'],
        {
          readContract: async () => compatibilityContract(),
          connect: async () => ({
            destroy: async () => {},
            executor: {
              query: vi
                .fn()
                .mockResolvedValue([
                  { name: schema, metadata: '[]', canViewDefinition: 1 },
                ]),
            },
          }),
          createTargets,
          env: {},
          write: line => output.push(line),
        },
      )
      expect(code).toBe(schema === 'Schema123' ? 0 : 1)
      if (schema === 'Unverified124')
        expect(createTargets).not.toHaveBeenCalled()
      else
        expect(output.map(line => JSON.parse(line)).at(-1).deleted_rows).toBe(1)
    },
  )

  it('rejects changed columns or constraints even when every target is empty', async () => {
    const createTargets = vi.fn(() => [target(0)])
    const output: string[] = []
    expect(
      await runTransientCleanupCommand(['--contract', '/contract.json'], {
        readContract: async () => compatibilityContract(),
        connect: async () => ({
          destroy: async () => {},
          executor: {
            query: vi.fn().mockResolvedValue([
              {
                name: 'Schema123',
                metadata: '["changed constraint"]',
                canViewDefinition: 1,
              },
            ]),
          },
        }),
        createTargets,
        env: {},
        write: line => output.push(line),
      }),
    ).toBe(1)
    expect(createTargets).not.toHaveBeenCalled()
    expect(JSON.stringify(output)).not.toContain('changed constraint')
  })

  it('fails changed target applicability before deleting rows', async () => {
    const output: string[] = []
    const contract = compatibilityContract()
    contract.verification[0].targets.forEach(target => {
      target.outcome = 'not_applicable'
    })
    expect(
      await runTransientCleanupCommand(['--contract', '/contract.json'], {
        readContract: async () => contract,
        connect: async () => ({
          destroy: async () => {},
          executor: {
            query: vi
              .fn()
              .mockResolvedValue([
                { name: 'Schema123', metadata: '[]', canViewDefinition: 1 },
              ]),
          },
        }),
        createTargets: () => [target(1)],
        env: {},
        write: line => output.push(line),
      }),
    ).toBe(1)
    expect(output.map(line => JSON.parse(line)).at(-1)).toMatchObject({
      outcome: 'failure',
      deleted_rows: 0,
    })
  })
  it.each([
    { metadata: [] },
    { metadata: [{ canViewDefinition: 0, metadata: '[]' }] },
    { metadata: [{ canViewDefinition: 1 }] },
  ])(
    'rejects unavailable schema definitions before collecting evidence: %j',
    async ({ metadata }) => {
      const createTargets = vi.fn(() => [target(0)])
      expect(
        await runTransientCleanupCommand(['--compatibility-evidence'], {
          connect: async () => ({
            destroy: async () => {},
            executor: {
              query: vi
                .fn()
                .mockImplementation(async (sql: string) =>
                  sql.includes('dbo.migrations')
                    ? [{ name: 'Schema123' }]
                    : metadata,
                ),
            },
          }),
          createTargets,
          env: {},
          write: () => {},
        }),
      ).toBe(1)
      expect(createTargets).not.toHaveBeenCalled()
    },
  )

  it('collects aggregate schema evidence through the released cleanup command', async () => {
    const output: string[] = []
    expect(
      await runTransientCleanupCommand(['--compatibility-evidence'], {
        connect: async () => ({
          destroy: async () => {},
          executor: {
            query: vi
              .fn()
              .mockResolvedValue([
                { name: 'Schema123', metadata: '[]', canViewDefinition: 1 },
              ]),
          },
        }),
        createTargets: () => [target(1)],
        env: {},
        write: line => output.push(line),
      }),
    ).toBe(0)
    expect(JSON.parse(output.at(-1) ?? '{}')).toEqual({
      event: 'transient_cleanup.schema.verified',
      schemaVersion: 'Schema123',
      schemaFingerprint: createHash('sha256').update('[]').digest('hex'),
      outcome: 'success',
      targets: [
        { kind: 'requirement_import_validation_sessions', outcome: 'success' },
      ],
    })
  })
  it('reports absent target tables using aggregate not_applicable outcomes', async () => {
    const output: string[] = []
    const query = vi
      .fn()
      .mockResolvedValue([
        { presentTableCount: 0, namedObjectCount: 0, canViewDefinition: 1 },
      ])
    const code = await runTransientCleanupCommand([], {
      connect: async () => ({ destroy: async () => {}, executor: { query } }),
      env: {},
      write: line => output.push(line),
    })
    expect(code).toBe(0)
    const events = output.map(line => JSON.parse(line))
    expect(events.slice(0, -1).map(event => event.outcome)).toEqual(
      Array(5).fill('not_applicable'),
    )
    expect(events.at(-1)).toMatchObject({ outcome: 'success', deleted_rows: 0 })
    expect(query).toHaveBeenCalledTimes(5)
  })

  it.each([
    { presentTableCount: 0, namedObjectCount: 0, canViewDefinition: 0 },
    { presentTableCount: 0, namedObjectCount: 1, canViewDefinition: 1 },
    { presentTableCount: 1, namedObjectCount: 1, canViewDefinition: 1 },
  ])('fails uncertain or partial forensic schemas: %j', async metadata => {
    const output: string[] = []
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('presentTableCount')) return [metadata]
      throw new Error('private destination payload token raw database error')
    })
    expect(
      await runTransientCleanupCommand([], {
        connect: async () => ({ destroy: async () => {}, executor: { query } }),
        env: {},
        write: line => output.push(line),
      }),
    ).toBe(1)
    const events = output.map(line => JSON.parse(line))
    expect(
      events.find(event => event.kind === 'ai_forensic_evidence'),
    ).toMatchObject({
      outcome: 'failure',
      failure_code: 'target_execution_failed',
    })
    expect(output.join('\n')).not.toMatch(
      /private|destination|payload|token|raw database error/,
    )
  })

  it('uses default bounds for every registered cleanup target', async () => {
    const query = vi
      .fn()
      .mockImplementation(async (sql: string, parameters?: unknown[]) =>
        sql.includes('presentTableCount')
          ? [
              {
                presentTableCount: parameters?.length,
                operableTableCount: parameters?.length,
                namedObjectCount: parameters?.length,
                canViewDefinition: 0,
              },
            ]
          : [
              {
                expiredRowCount: 0,
                expiredStoredBytes: 0,
                oldestExpiredAgeMs: null,
              },
            ],
      )

    await expect(
      runTransientCleanupCommand([], {
        connect: vi.fn().mockResolvedValue({
          destroy: vi.fn(),
          executor: { query },
        }),
        env: {},
        write: vi.fn(),
      }),
    ).resolves.toBe(0)
    expect(query).toHaveBeenCalledTimes(16)
  })

  it('fails missing purge permissions even when every backlog is empty', async () => {
    const output: string[] = []
    const query = vi
      .fn()
      .mockImplementation(async (sql: string, parameters?: unknown[]) =>
        sql.includes('presentTableCount')
          ? [
              {
                presentTableCount: parameters?.length,
                operableTableCount: 0,
                namedObjectCount: parameters?.length,
                canViewDefinition: 1,
              },
            ]
          : [
              {
                expiredRowCount: 0,
                expiredStoredBytes: 0,
                oldestExpiredAgeMs: null,
              },
            ],
      )
    expect(
      await runTransientCleanupCommand([], {
        connect: async () => ({ destroy: async () => {}, executor: { query } }),
        env: {},
        write: line => output.push(line),
      }),
    ).toBe(1)
    expect(JSON.parse(output.at(-1) ?? '{}')).toMatchObject({
      outcome: 'failure',
      deleted_rows: 0,
    })
  })

  it('cleans registered targets without any MCP request traffic', async () => {
    const destroy = vi.fn()
    const executor = { query: vi.fn() }
    const output: string[] = []
    const createTargets = vi.fn(() => [target(3)])

    const exitCode = await runTransientCleanupCommand([], {
      connect: vi.fn().mockResolvedValue({ destroy, executor }),
      createTargets,
      env: {
        TRANSIENT_CLEANUP_BACKLOG_TARGET: '0',
        TRANSIENT_CLEANUP_BATCH_SIZE: '2',
        TRANSIENT_CLEANUP_WORK_LIMIT: '3',
      },
      write: line => output.push(line),
    })

    expect(exitCode).toBe(0)
    expect(createTargets).toHaveBeenCalledWith(executor)
    expect(destroy).toHaveBeenCalledOnce()
    expect(output.map(line => JSON.parse(line))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deleted_rows: 3,
          event: 'transient_cleanup.target.completed',
          expired_row_count: 3,
          expired_stored_bytes: 384,
          kind: 'requirement_import_validation_sessions',
          oldest_expired_age_ms: 30_000,
          outcome: 'success',
          remaining_expired_row_count: 0,
        }),
      ]),
    )
  })

  it('returns a retryable failed outcome without exposing the error', async () => {
    const output: string[] = []
    const failedTarget = target(1)
    failedTarget.purgeBatch = vi
      .fn()
      .mockRejectedValue(
        new Error('token payload destination raw database error'),
      )

    const exitCode = await runTransientCleanupCommand([], {
      connect: vi.fn().mockResolvedValue({
        destroy: vi.fn(),
        executor: { query: vi.fn() },
      }),
      createTargets: () => [failedTarget],
      env: {},
      write: line => output.push(line),
    })

    expect(exitCode).toBe(1)
    expect(output.join('\n')).not.toMatch(
      /token|payload|destination|raw database error/u,
    )
    expect(output.map(line => JSON.parse(line))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failure_code: 'target_execution_failed',
          outcome: 'failure',
        }),
      ]),
    )
  })

  it('is safe when an optional cleanup target is not registered', async () => {
    const output: string[] = []

    await expect(
      runTransientCleanupCommand([], {
        connect: vi.fn().mockResolvedValue({
          destroy: vi.fn(),
          executor: { query: vi.fn() },
        }),
        createTargets: () => [],
        env: {},
        write: line => output.push(line),
      }),
    ).resolves.toBe(0)
    expect(output.map(line => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        event: 'transient_cleanup.run.completed',
        outcome: 'success',
      }),
    )
  })

  it('rejects invalid bounds before connecting and reports a stable failure', async () => {
    const connect = vi.fn()
    const output: string[] = []

    const exitCode = await runTransientCleanupCommand([], {
      connect,
      createTargets: () => [],
      env: { TRANSIENT_CLEANUP_BATCH_SIZE: 'unbounded' },
      write: line => output.push(line),
    })

    expect(exitCode).toBe(1)
    expect(connect).not.toHaveBeenCalled()
    expect(output).toHaveLength(1)
    expect(JSON.parse(output[0] ?? '')).toMatchObject({
      event: 'transient_cleanup.run.completed',
      failure_code: 'runner_execution_failed',
      outcome: 'failure',
    })
    expect(output[0]).not.toContain('unbounded')
  })

  it('supports help and rejects unexpected arguments without connecting', async () => {
    const connect = vi.fn()
    const output: string[] = []
    const dependencies = {
      connect,
      createTargets: () => [],
      env: {},
      write: (line: string) => output.push(line),
    }

    await expect(
      runTransientCleanupCommand(['--help'], dependencies),
    ).resolves.toBe(0)
    await expect(
      runTransientCleanupCommand(['unexpected'], dependencies),
    ).resolves.toBe(1)
    expect(connect).not.toHaveBeenCalled()
    expect(output[0]).toContain('Usage:')
    expect(JSON.parse(output[1] ?? '')).toMatchObject({
      failure_code: 'runner_execution_failed',
    })
  })

  it('fails safely when connection cleanup fails after a successful run', async () => {
    const output: string[] = []
    const exitCode = await runTransientCleanupCommand([], {
      connect: vi.fn().mockResolvedValue({
        destroy: vi.fn().mockRejectedValue(new Error('database secret')),
        executor: { query: vi.fn() },
      }),
      createTargets: () => [],
      env: {},
      write: line => output.push(line),
    })

    expect(exitCode).toBe(1)
    expect(output.map(line => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        failure_code: 'runner_execution_failed',
        outcome: 'failure',
      }),
    )
    expect(output.join('\n')).not.toContain('database secret')
  })

  it('writes through the platform console by default', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await expect(runTransientCleanupCommand(['--help'])).resolves.toBe(0)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    info.mockRestore()
  })

  it('opens and closes the production SQL Server connection by default', async () => {
    const dataSource = {
      destroy: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    }
    vi.mocked(createSqlServerDataSource).mockReturnValue(dataSource as never)

    await expect(
      runTransientCleanupCommand([], {
        createTargets: () => [],
        env: {},
        write: vi.fn(),
      }),
    ).resolves.toBe(0)
    expect(createSqlServerDataSource).toHaveBeenCalledWith({
      entities: [],
      logging: false,
    })
    expect(dataSource.initialize).toHaveBeenCalledOnce()
    expect(dataSource.destroy).toHaveBeenCalledOnce()
  })

  it('sets a failed process exit code when the top-level command rejects', async () => {
    const originalExitCode = process.exitCode
    try {
      await setTransientCleanupProcessExitCode(Promise.resolve(0))
      expect(process.exitCode).toBe(0)

      await setTransientCleanupProcessExitCode(
        Promise.reject(new Error('unexpected top-level failure')),
      )
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = originalExitCode
    }
  })
})
