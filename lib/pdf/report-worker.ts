import { Worker } from 'node:worker_threads'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import type {
  PdfReportWorkerMessage,
  PdfWorkerData,
} from '@/lib/pdf/report-worker-contract'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'
import type { ReportModel } from '@/lib/reports/types'

interface RenderReportInWorkerOptions {
  locale: string
  maxBytes: number
  memoryLimitMib: number
  model: ReportModel
  outputPath: string
  signal?: AbortSignal
}

interface RenderDataSubjectExportInWorkerOptions {
  exportData: DataSubjectExportV1
  locale: string
  maxBytes: number
  memoryLimitMib: number
  outputPath: string
  signal?: AbortSignal
}

interface RenderPdfInWorkerOptions {
  maxBytes: number
  memoryLimitMib: number
  signal?: AbortSignal
  workerData: PdfWorkerData
}

export async function renderReportInWorker(
  options: RenderReportInWorkerOptions,
): Promise<number> {
  return renderPdfInWorker({
    maxBytes: options.maxBytes,
    memoryLimitMib: options.memoryLimitMib,
    signal: options.signal,
    workerData: {
      locale: options.locale,
      maxBytes: options.maxBytes,
      model: options.model,
      outputPath: options.outputPath,
    },
  })
}

export async function renderDataSubjectExportInWorker(
  options: RenderDataSubjectExportInWorkerOptions,
): Promise<number> {
  return renderPdfInWorker({
    maxBytes: options.maxBytes,
    memoryLimitMib: options.memoryLimitMib,
    signal: options.signal,
    workerData: {
      document: {
        exportData: options.exportData,
        kind: 'data-subject-export',
        locale: options.locale,
      },
      maxBytes: options.maxBytes,
      outputPath: options.outputPath,
    },
  })
}

async function renderPdfInWorker(
  options: RenderPdfInWorkerOptions,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker('./lib/pdf/report-worker-entry.ts', {
      resourceLimits: {
        maxOldGenerationSizeMb: options.memoryLimitMib,
      },
      workerData: options.workerData,
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
