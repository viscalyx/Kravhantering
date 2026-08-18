import { getApplicationSettings } from '@/lib/dal/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import {
  GeneratedOutputError,
  isGeneratedOutputError,
} from '@/lib/generated-output/errors'
import {
  createGeneratedOutputTerminalRecorder,
  createGenerationDeadline,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'
import {
  acquireGeneratedOutputSpool,
  createGeneratedOutputFileResponse,
  type GeneratedOutputSpool,
  generatedOutputCapacitySnapshot,
  writeBoundedFile,
} from '@/lib/generated-output/spool'
import {
  jsonContentDisposition,
  pdfContentDisposition,
} from '@/lib/http/content-disposition'
import type { ExportFilenameLocale } from '@/lib/http/validation'
import { renderDataSubjectExportInWorker } from '@/lib/pdf/report-worker'
import { createPdfItemLimitError } from '@/lib/pdf/synchronous-generation'
import {
  type CollectDataSubjectExportInput,
  collectDataSubjectExport,
} from '@/lib/privacy/data-subject-export'
import { dataSubjectExportFilename } from '@/lib/privacy/data-subject-export-filenames'
import type {
  DataSubjectExportDelivery,
  DataSubjectExportV1,
} from '@/lib/privacy/data-subject-export-types'
import type { RequestContext } from '@/lib/requirements/auth'

const UTF8_BOM_BYTE_LENGTH = 3

export interface GenerateDataSubjectExportOptions {
  context: RequestContext
  db: SqlServerDatabase
  delivery: DataSubjectExportDelivery
  input: CollectDataSubjectExportInput
  locale: ExportFilenameLocale
  requestSignal: AbortSignal
}

export interface GeneratedDataSubjectExport {
  payload: DataSubjectExportV1
  response: Response
}

export async function generateDataSubjectExport(
  options: GenerateDataSubjectExportOptions,
): Promise<GeneratedDataSubjectExport> {
  const settings = await getApplicationSettings(options.db)
  if (options.delivery === 'pdf') {
    return generatePdfDataSubjectExport(options, settings)
  }
  return generateJsonDataSubjectExport(options, settings)
}

async function generatePdfDataSubjectExport(
  options: GenerateDataSubjectExportOptions,
  settings: Awaited<ReturnType<typeof getApplicationSettings>>,
): Promise<GeneratedDataSubjectExport> {
  const terminal = createGeneratedOutputTerminalRecorder(
    'privacy.data_subject_pdf_export',
    options.context,
  )
  let spool: GeneratedOutputSpool | undefined
  let deadline: ReturnType<typeof createGenerationDeadline> | undefined
  let byteCount = 0
  let itemCount = 0
  const terminalMetrics = () => ({
    activeCount: generatedOutputCapacitySnapshot().activePdf,
    byteCount,
    concurrencyLimit: settings.pdfReportConcurrencyPerNode,
    itemCount,
    itemLimit: settings.pdfReportMaxRequirements,
    timeoutMs: settings.pdfReportTimeoutSeconds * 1000,
    workerMemoryLimitBytes: settings.pdfWorkerMemoryMib * 1024 * 1024,
  })

  try {
    spool = await acquireGeneratedOutputSpool({
      concurrencyLimit: settings.pdfReportConcurrencyPerNode,
      maxFileBytes: settings.pdfReportMaxFileBytes,
      output: 'pdf',
    })
    deadline = createGenerationDeadline(
      settings.pdfReportTimeoutSeconds,
      options.requestSignal,
    )
    const payload = await collectDataSubjectExport(options.db, options.input, {
      createItemLimitError: createPdfItemLimitError,
      maxItems: settings.pdfReportMaxRequirements,
      signal: deadline.signal,
    })
    itemCount = payload.summary.itemCount
    throwIfGenerationAborted(deadline.signal)
    byteCount = await renderDataSubjectExportInWorker({
      exportData: payload,
      locale: options.locale,
      maxBytes: settings.pdfReportMaxFileBytes,
      memoryLimitMib: settings.pdfWorkerMemoryMib,
      outputPath: spool.filePath,
      signal: deadline.signal,
    })
    throwIfGenerationAborted(deadline.signal)
    deadline.dispose()
    deadline = undefined
    const response = await createGeneratedOutputFileResponse(
      spool,
      {
        'Content-Disposition': pdfContentDisposition(
          dataSubjectExportFilename(payload, 'pdf', options.locale),
        ),
        'Content-Type': 'application/pdf',
      },
      {
        onCancel: () => terminal.cancelled(terminalMetrics()),
        onComplete: () => terminal.completed(terminalMetrics()),
        onError: () =>
          terminal.failed(
            new Error('Privacy PDF response stream failed'),
            terminalMetrics(),
          ),
      },
    )
    spool = undefined
    return { payload, response }
  } catch (error) {
    itemCount = observedItemCount(error, itemCount)
    terminal.failed(error, terminalMetrics())
    throw error
  } finally {
    deadline?.dispose()
    spool?.releaseGeneration()
    await spool?.releaseSpool()
  }
}

async function generateJsonDataSubjectExport(
  options: GenerateDataSubjectExportOptions,
  settings: Awaited<ReturnType<typeof getApplicationSettings>>,
): Promise<GeneratedDataSubjectExport> {
  const terminal = createGeneratedOutputTerminalRecorder(
    'privacy.data_subject_json_export',
    options.context,
  )
  let spool: GeneratedOutputSpool | undefined
  let deadline: ReturnType<typeof createGenerationDeadline> | undefined
  let byteCount = 0
  let itemCount = 0
  const terminalMetrics = () => ({
    activeCount: generatedOutputCapacitySnapshot().activeCsv,
    byteCount,
    concurrencyLimit: settings.csvExportConcurrencyPerNode,
    itemCount,
    itemLimit: settings.csvExportMaxItems,
    timeoutMs: settings.csvExportTimeoutSeconds * 1000,
  })

  try {
    spool = await acquireGeneratedOutputSpool({
      concurrencyLimit: settings.csvExportConcurrencyPerNode,
      maxFileBytes: settings.csvExportMaxFileBytes,
      output: 'json',
    })
    deadline = createGenerationDeadline(
      settings.csvExportTimeoutSeconds,
      options.requestSignal,
    )
    const payload = await collectDataSubjectExport(options.db, options.input, {
      createItemLimitError: limit => jsonItemLimitError(limit),
      maxItems: settings.csvExportMaxItems,
      signal: deadline.signal,
    })
    itemCount = payload.summary.itemCount
    throwIfGenerationAborted(deadline.signal)
    byteCount = await writeBoundedJson(
      spool.filePath,
      payload,
      settings.csvExportMaxFileBytes,
      deadline.signal,
    )
    throwIfGenerationAborted(deadline.signal)
    deadline.dispose()
    deadline = undefined
    const response = await createGeneratedOutputFileResponse(
      spool,
      {
        'Content-Disposition': jsonContentDisposition(
          dataSubjectExportFilename(payload, 'json', options.locale),
        ),
        'Content-Type': 'application/json;charset=utf-8',
      },
      {
        onCancel: () => terminal.cancelled(terminalMetrics()),
        onComplete: () => terminal.completed(terminalMetrics()),
        onError: () =>
          terminal.failed(
            new Error('Privacy JSON response stream failed'),
            terminalMetrics(),
          ),
      },
    )
    spool = undefined
    return { payload, response }
  } catch (error) {
    itemCount = observedItemCount(error, itemCount)
    terminal.failed(error, terminalMetrics())
    throw error
  } finally {
    deadline?.dispose()
    spool?.releaseGeneration()
    await spool?.releaseSpool()
  }
}

async function writeBoundedJson(
  filePath: string,
  payload: DataSubjectExportV1,
  maxFileBytes: number,
  signal: AbortSignal,
): Promise<number> {
  try {
    return await writeBoundedFile(
      filePath,
      serializeJsonChunks(payload),
      Math.max(maxFileBytes - UTF8_BOM_BYTE_LENGTH, 0),
      'json',
      signal,
    )
  } catch (error) {
    if (
      isGeneratedOutputError(error) &&
      error.capacityReason === 'byte_limit_exceeded'
    ) {
      throw new GeneratedOutputError(
        'output_limit_exceeded',
        'byte_limit_exceeded',
        { limit: maxFileBytes, limitKind: 'bytes', output: 'json' },
        { cause: error },
      )
    }
    throw error
  }
}

function jsonItemLimitError(limit: number): GeneratedOutputError {
  return new GeneratedOutputError(
    'output_limit_exceeded',
    'item_limit_exceeded',
    { limit, limitKind: 'items', output: 'json' },
  )
}

function observedItemCount(error: unknown, current: number): number {
  if (
    isGeneratedOutputError(error) &&
    error.capacityReason === 'item_limit_exceeded' &&
    error.details.limit != null
  ) {
    return Math.max(current, error.details.limit + 1)
  }
  return current
}

function* serializeJsonChunks(value: unknown): Generator<string> {
  if (Array.isArray(value)) {
    yield '['
    for (const [index, item] of value.entries()) {
      if (index > 0) yield ','
      yield* serializeJsonChunks(item === undefined ? null : item)
    }
    yield ']'
    return
  }
  if (value && typeof value === 'object') {
    yield '{'
    let emitted = 0
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      if (emitted > 0) yield ','
      yield JSON.stringify(key)
      yield ':'
      yield* serializeJsonChunks(item)
      emitted += 1
    }
    yield '}'
    return
  }
  yield JSON.stringify(value) ?? 'null'
}
