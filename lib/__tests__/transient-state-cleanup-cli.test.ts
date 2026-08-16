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

describe('transient cleanup command', () => {
  it('uses default bounds for every registered cleanup target', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        expiredRowCount: 0,
        expiredStoredBytes: 0,
        oldestExpiredAgeMs: null,
      },
    ])

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
    expect(query).toHaveBeenCalledTimes(3)
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
