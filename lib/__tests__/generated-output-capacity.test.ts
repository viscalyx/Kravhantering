import { describe, expect, it } from 'vitest'
import {
  acquireGeneratedOutputCapacity,
  generatedOutputCapacitySnapshot,
  runWithGeneratedOutputCapacity,
} from '@/lib/generated-output/capacity'
import { ClientCancelledGeneratedOutputError } from '@/lib/generated-output/operation'

describe('generated-output capacity', () => {
  it('enforces one process-wide PDF concurrency limit', () => {
    const first = acquireGeneratedOutputCapacity({
      concurrencyLimit: 2,
      output: 'pdf',
    })
    const second = acquireGeneratedOutputCapacity({
      concurrencyLimit: 2,
      output: 'pdf',
    })

    try {
      expect(generatedOutputCapacitySnapshot().activePdf).toBe(2)
      expect(() =>
        acquireGeneratedOutputCapacity({
          concurrencyLimit: 2,
          output: 'pdf',
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'capacity_busy',
          details: { output: 'pdf', retryAfterSeconds: 5 },
        }),
      )
    } finally {
      first.release()
      second.release()
    }
  })

  it.each([
    ['failure', new Error('render failed')],
    ['cancellation', new ClientCancelledGeneratedOutputError()],
  ])('releases PDF capacity exactly once after %s', async (_name, error) => {
    await expect(
      runWithGeneratedOutputCapacity(
        { concurrencyLimit: 1, output: 'pdf' },
        async capacity => {
          expect(capacity.isActive()).toBe(true)
          throw error
        },
      ),
    ).rejects.toBe(error)

    expect(generatedOutputCapacitySnapshot().activePdf).toBe(0)
  })

  it('holds capacity until successful work settles and releases idempotently', async () => {
    let finish: (() => void) | undefined
    const work = runWithGeneratedOutputCapacity(
      { concurrencyLimit: 1, output: 'pdf' },
      capacity =>
        new Promise<void>(resolve => {
          finish = () => {
            capacity.release()
            capacity.release()
            resolve()
          }
        }),
    )

    expect(generatedOutputCapacitySnapshot().activePdf).toBe(1)
    expect(() =>
      acquireGeneratedOutputCapacity({
        concurrencyLimit: 1,
        output: 'pdf',
      }),
    ).toThrow(expect.objectContaining({ code: 'capacity_busy' }))

    finish?.()
    await work
    expect(generatedOutputCapacitySnapshot().activePdf).toBe(0)
  })
})
