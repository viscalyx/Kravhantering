import { describe, expect, it, vi } from 'vitest'
import {
  runTransientStateCleanup,
  type TransientCleanupLogEvent,
  type TransientCleanupTarget,
} from '@/lib/transient-cleanup/runner'

function createBacklogTarget(
  initialRows: number,
  options: { failOnBatch?: number } = {},
): TransientCleanupTarget & { requestedLimits: number[] } {
  let rows = initialRows
  let batch = 0
  const requestedLimits: number[] = []
  return {
    kind: 'test_rows',
    requestedLimits,
    async inspect() {
      return {
        expiredRowCount: rows,
        expiredStoredBytes: rows * 10,
        oldestExpiredAgeMs: rows === 0 ? null : 60_000,
      }
    },
    async purgeBatch(limit) {
      batch += 1
      requestedLimits.push(limit)
      if (options.failOnBatch === batch) throw new Error('payload-secret')
      const deletedRows = Math.min(rows, limit)
      rows -= deletedRows
      return { deletedRows }
    },
  }
}

describe('transient state cleanup runner', () => {
  it('skips an absent target without consuming work or failing applicable targets', async () => {
    const absent = {
      ...createBacklogTarget(20),
      isApplicable: async () => false,
    }
    const applicable = createBacklogTarget(2)
    const events: TransientCleanupLogEvent[] = []
    const result = await runTransientStateCleanup([absent, applicable], {
      backlogTarget: 0,
      batchSize: 2,
      workLimit: 2,
      record: event => events.push(event),
    })
    expect(result.outcome).toBe('success')
    expect(result.targets[0]).toMatchObject({
      outcome: 'not_applicable',
      deletedRows: 0,
      initialExpiredRowCount: null,
      remainingExpiredRowCount: null,
    })
    expect(absent.requestedLimits).toEqual([])
    expect(result.targets[1].deletedRows).toBe(2)
    expect(events[0].outcome).toBe('not_applicable')
  })

  it('uses bounded batches and stops at the total work limit', async () => {
    const target = createBacklogTarget(250)
    const inspect = vi.spyOn(target, 'inspect')

    const result = await runTransientStateCleanup([target], {
      backlogTarget: 0,
      batchSize: 100,
      workLimit: 220,
    })

    expect(target.requestedLimits).toEqual([100, 100, 20])
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ outcome: 'success' })
    expect(result.targets[0]).toMatchObject({
      deletedRows: 220,
      initialExpiredRowCount: 250,
      outcome: 'success',
      remainingExpiredRowCount: 30,
    })
  })

  it('does not purge below the configured backlog target', async () => {
    const target = createBacklogTarget(120)

    await runTransientStateCleanup([target], {
      backlogTarget: 50,
      batchSize: 100,
      workLimit: 500,
    })

    expect(target.requestedLimits).toEqual([70])
  })

  it('isolates target failures and emits payload-safe failure telemetry', async () => {
    const failed = createBacklogTarget(2, { failOnBatch: 1 })
    const successful = createBacklogTarget(1)
    successful.kind = 'successful_rows'
    const events: TransientCleanupLogEvent[] = []

    const result = await runTransientStateCleanup([failed, successful], {
      backlogTarget: 0,
      batchSize: 10,
      record: event => events.push(event),
      workLimit: 10,
    })

    expect(result.outcome).toBe('failure')
    expect(result.targets.map(target => target.outcome)).toEqual([
      'failure',
      'success',
    ])
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureCode: 'target_execution_failed',
          kind: 'test_rows',
          outcome: 'failure',
        }),
        expect.objectContaining({
          kind: 'successful_rows',
          outcome: 'success',
        }),
      ]),
    )
    expect(JSON.stringify(events)).not.toContain('payload-secret')
  })

  it('can retry safely after a partial failed run', async () => {
    const target = createBacklogTarget(3, { failOnBatch: 2 })

    const first = await runTransientStateCleanup([target], {
      backlogTarget: 0,
      batchSize: 2,
      workLimit: 3,
    })
    const second = await runTransientStateCleanup([target], {
      backlogTarget: 0,
      batchSize: 2,
      workLimit: 3,
    })

    expect(first.targets[0]).toMatchObject({
      deletedRows: 2,
      outcome: 'failure',
    })
    expect(second.targets[0]).toMatchObject({
      deletedRows: 1,
      outcome: 'success',
      remainingExpiredRowCount: 0,
    })
  })

  it('treats another worker making progress as a successful no-op', async () => {
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({
        expiredRowCount: 1,
        expiredStoredBytes: 10,
        oldestExpiredAgeMs: 1000,
      })
      .mockResolvedValue({
        expiredRowCount: 0,
        expiredStoredBytes: 0,
        oldestExpiredAgeMs: null,
      })
    const target: TransientCleanupTarget = {
      kind: 'overlap_rows',
      inspect,
      purgeBatch: vi.fn().mockResolvedValue({ deletedRows: 0 }),
    }

    const result = await runTransientStateCleanup([target], {
      backlogTarget: 0,
      batchSize: 10,
      workLimit: 10,
    })

    expect(result).toMatchObject({ outcome: 'success' })
    expect(result.targets[0]).toMatchObject({
      deletedRows: 0,
      remainingExpiredRowCount: 0,
    })
  })

  it('keeps cleanup running when telemetry and failure inspection fail', async () => {
    const target: TransientCleanupTarget = {
      kind: 'unavailable_rows',
      inspect: vi.fn().mockRejectedValue(new Error('unavailable')),
      purgeBatch: vi.fn(),
    }

    const result = await runTransientStateCleanup([target], {
      backlogTarget: Number.NaN,
      batchSize: Number.NaN,
      record: () => {
        throw new Error('telemetry unavailable')
      },
      workLimit: Number.NaN,
    })

    expect(result).toMatchObject({ outcome: 'failure' })
    expect(result.targets[0]).toMatchObject({
      initialExpiredRowCount: null,
      remainingExpiredRowCount: null,
    })
  })
})
