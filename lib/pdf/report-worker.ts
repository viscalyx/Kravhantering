import { Worker } from 'node:worker_threads'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import type { ReportModel } from '@/lib/reports/types'

interface RenderReportInWorkerOptions {
  locale: string
  maxBytes: number
  memoryLimitMib: number
  model: ReportModel
  outputPath: string
  signal?: AbortSignal
}

type PdfReportWorkerMessage =
  | { byteCount: number; ok: true }
  | { failure: 'byte_limit' | 'storage'; ok: false }

export async function renderReportInWorker(
  options: RenderReportInWorkerOptions,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker('./lib/pdf/report-worker-entry.ts', {
      resourceLimits: {
        maxOldGenerationSizeMb: options.memoryLimitMib,
      },
      workerData: {
        locale: options.locale,
        maxBytes: options.maxBytes,
        model: options.model,
        outputPath: options.outputPath,
      },
    })
    let settled = false
    let terminating = false

    const settleRejected = (error: unknown): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abortWorker)
      reject(error)
    }

    const abortWorker = (): void => {
      if (settled || terminating) return
      terminating = true
      void worker
        .terminate()
        .then(
          () =>
            settleRejected(
              options.signal?.reason instanceof Error
                ? options.signal.reason
                : new Error('PDF report worker aborted'),
            ),
          settleRejected,
        )
    }

    worker.once('message', (message: PdfReportWorkerMessage) => {
      if (settled) return
      if (!message.ok && message.failure === 'byte_limit') {
        settleRejected(
          new GeneratedOutputError(
            'output_limit_exceeded',
            'byte_limit_exceeded',
            {
              limit: options.maxBytes,
              limitKind: 'bytes',
              output: 'pdf',
            },
          ),
        )
        return
      }
      if (!message.ok && message.failure === 'storage') {
        settleRejected(
          new GeneratedOutputError(
            'temporary_storage_unavailable',
            'temporary_storage_unavailable',
            { output: 'pdf' },
          ),
        )
        return
      }
      if (!message.ok) return
      settled = true
      options.signal?.removeEventListener('abort', abortWorker)
      resolve(message.byteCount)
    })
    worker.once('error', error => {
      if (
        (error as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY'
      ) {
        settleRejected(
          new GeneratedOutputError(
            'pdf_worker_memory_exceeded',
            'worker_memory_exceeded',
            { output: 'pdf' },
            { cause: error },
          ),
        )
        return
      }
      settleRejected(
        new GeneratedOutputError(
          'pdf_worker_failed',
          'worker_failed',
          { output: 'pdf' },
          { cause: error },
        ),
      )
    })
    worker.once('exit', code => {
      if (settled || terminating) return
      settleRejected(
        new GeneratedOutputError(
          'pdf_worker_failed',
          'worker_failed',
          { output: 'pdf' },
          { cause: new Error(`PDF report worker exited with code ${code}`) },
        ),
      )
    })
    options.signal?.addEventListener('abort', abortWorker, { once: true })
    if (options.signal?.aborted) abortWorker()
  })
}
