import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerState = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void
  class Worker {
    listeners = new Map<string, Listener>()
    options: Record<string, unknown>
    path: string
    terminate = vi.fn(async () => 1)

    constructor(path: string, options: Record<string, unknown>) {
      this.path = path
      this.options = options
      workerState.instances.push(this)
    }

    once(event: string, listener: Listener) {
      this.listeners.set(event, listener)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      this.listeners.get(event)?.(...args)
    }
  }
  return { instances: [] as Worker[], Worker }
})

vi.mock('node:worker_threads', () => ({
  default: { Worker: workerState.Worker },
  Worker: workerState.Worker,
}))

import { renderReportInWorker } from '@/lib/pdf/report-worker'

function options(signal?: AbortSignal) {
  return {
    locale: 'sv',
    maxBytes: 2048,
    memoryLimitMib: 384,
    model: { sections: [], title: 'Test' },
    outputPath: '/tmp/output.pdf',
    signal,
  } as never
}

describe('PDF report worker orchestration', () => {
  beforeEach(() => {
    workerState.instances.length = 0
  })

  it('passes the source entry, resource limit, model, and output bound', async () => {
    const result = renderReportInWorker(options())
    const worker = workerState.instances[0]

    expect(worker.path).toBe('./lib/pdf/report-worker-entry.ts')
    expect(worker.options).toMatchObject({
      resourceLimits: { maxOldGenerationSizeMb: 384 },
      workerData: {
        locale: 'sv',
        maxBytes: 2048,
        outputPath: '/tmp/output.pdf',
      },
    })
    worker.emit('message', { byteCount: 1024, ok: true })
    await expect(result).resolves.toBe(1024)
  })

  it.each([
    [
      { failure: 'byte_limit', ok: false },
      'output_limit_exceeded',
      'byte_limit_exceeded',
    ],
    [
      { failure: 'storage', ok: false },
      'temporary_storage_unavailable',
      'temporary_storage_unavailable',
    ],
  ])(
    'maps bounded worker failure %o',
    async (message, code, capacityReason) => {
      const result = renderReportInWorker(options())
      workerState.instances[0].emit('message', message)
      await expect(result).rejects.toMatchObject({ capacityReason, code })
    },
  )

  it('maps V8 out-of-memory separately from an unexpected crash', async () => {
    const memoryResult = renderReportInWorker(options())
    const memoryError = Object.assign(new Error('heap'), {
      code: 'ERR_WORKER_OUT_OF_MEMORY',
    })
    workerState.instances[0].emit('error', memoryError)
    await expect(memoryResult).rejects.toMatchObject({
      capacityReason: 'worker_memory_exceeded',
      code: 'pdf_worker_memory_exceeded',
    })

    const crashResult = renderReportInWorker(options())
    workerState.instances[1].emit('exit', 9)
    await expect(crashResult).rejects.toMatchObject({
      capacityReason: 'worker_failed',
      code: 'pdf_worker_failed',
    })
  })

  it('awaits worker termination and preserves the abort reason', async () => {
    const controller = new AbortController()
    const result = renderReportInWorker(options(controller.signal))
    const worker = workerState.instances[0]
    const reason = new Error('cancelled by test')
    controller.abort(reason)

    await expect(result).rejects.toBe(reason)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
