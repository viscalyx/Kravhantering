import { getApplicationSettings } from '@/lib/dal/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import {
  GeneratedOutputError,
  isGeneratedOutputError,
} from '@/lib/generated-output/errors'
import {
  createGeneratedOutputTerminalRecorder,
  createGenerationDeadline,
  type GeneratedOutputOperation,
  type GeneratedOutputTerminalMetrics,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'
import {
  acquireGeneratedOutputSpool,
  createGeneratedOutputFileResponse,
  type GeneratedOutputAdmissionOptions,
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

interface BoundedDataSubjectExportConfiguration
  extends GeneratedOutputAdmissionOptions {
  additionalMetrics?: Pick<
    GeneratedOutputTerminalMetrics,
    'workerMemoryLimitBytes'
  >
  capacityField: 'activePdf' | 'activeCsv'
  createItemLimitError: (limit: number) => GeneratedOutputError
  generate: (
    payload: DataSubjectExportV1,
    filePath: string,
    signal: AbortSignal,
  ) => Promise<number>
  maxItems: number
  operation: GeneratedOutputOperation
  output: DataSubjectExportDelivery
  responseHeaders: (payload: DataSubjectExportV1) => HeadersInit
  streamErrorMessage: string
  timeoutSeconds: number
}

async function generatePdfDataSubjectExport(
  options: GenerateDataSubjectExportOptions,
  settings: Awaited<ReturnType<typeof getApplicationSettings>>,
): Promise<GeneratedDataSubjectExport> {
  return generateBoundedDataSubjectExport(options, {
    operation: 'privacy.data_subject_pdf_export',
    output: 'pdf',
    capacityField: 'activePdf',
    concurrencyLimit: settings.pdfReportConcurrencyPerNode,
    maxFileBytes: settings.pdfReportMaxFileBytes,
    maxItems: settings.pdfReportMaxRequirements,
    timeoutSeconds: settings.pdfReportTimeoutSeconds,
    additionalMetrics: {
      workerMemoryLimitBytes: settings.pdfWorkerMemoryMib * 1024 * 1024,
    },
    createItemLimitError: createPdfItemLimitError,
    generate: (payload, filePath, signal) =>
      renderDataSubjectExportInWorker({
        exportData: payload,
        locale: options.locale,
        maxBytes: settings.pdfReportMaxFileBytes,
        memoryLimitMib: settings.pdfWorkerMemoryMib,
        outputPath: filePath,
        signal,
      }),
    responseHeaders: payload => ({
      'Content-Disposition': pdfContentDisposition(
        dataSubjectExportFilename(payload, 'pdf', options.locale),
      ),
      'Content-Type': 'application/pdf',
    }),
    streamErrorMessage: 'Privacy PDF response stream failed',
  })
}

async function generateJsonDataSubjectExport(
  options: GenerateDataSubjectExportOptions,
  settings: Awaited<ReturnType<typeof getApplicationSettings>>,
): Promise<GeneratedDataSubjectExport> {
  return generateBoundedDataSubjectExport(options, {
    operation: 'privacy.data_subject_json_export',
    output: 'json',
    capacityField: 'activeCsv',
    concurrencyLimit: settings.csvExportConcurrencyPerNode,
    maxFileBytes: settings.csvExportMaxFileBytes,
    maxItems: settings.csvExportMaxItems,
    timeoutSeconds: settings.csvExportTimeoutSeconds,
    createItemLimitError: jsonItemLimitError,
    generate: (payload, filePath, signal) =>
      writeBoundedJson(
        filePath,
        payload,
        settings.csvExportMaxFileBytes,
        signal,
      ),
    responseHeaders: payload => ({
      'Content-Disposition': jsonContentDisposition(
        dataSubjectExportFilename(payload, 'json', options.locale),
      ),
      'Content-Type': 'application/json;charset=utf-8',
    }),
    streamErrorMessage: 'Privacy JSON response stream failed',
  })
}

async function generateBoundedDataSubjectExport(
  options: GenerateDataSubjectExportOptions,
  configuration: BoundedDataSubjectExportConfiguration,
): Promise<GeneratedDataSubjectExport> {
  const terminal = createGeneratedOutputTerminalRecorder(
    configuration.operation,
    options.context,
  )
  let spool: GeneratedOutputSpool | undefined
  let deadline: ReturnType<typeof createGenerationDeadline> | undefined
  let byteCount = 0
  let itemCount = 0
  const terminalMetrics = (): GeneratedOutputTerminalMetrics => ({
    activeCount: generatedOutputCapacitySnapshot()[configuration.capacityField],
    byteCount,
    concurrencyLimit: configuration.concurrencyLimit,
    itemCount,
    itemLimit: configuration.maxItems,
    timeoutMs: configuration.timeoutSeconds * 1000,
    ...configuration.additionalMetrics,
  })

  try {
    spool = await acquireGeneratedOutputSpool({
      concurrencyLimit: configuration.concurrencyLimit,
      maxFileBytes: configuration.maxFileBytes,
      output: configuration.output,
    })
    deadline = createGenerationDeadline(
      configuration.timeoutSeconds,
      options.requestSignal,
    )
    const payload = await collectDataSubjectExport(options.db, options.input, {
      createItemLimitError: configuration.createItemLimitError,
      maxItems: configuration.maxItems,
      signal: deadline.signal,
    })
    itemCount = payload.summary.itemCount
    throwIfGenerationAborted(deadline.signal)
    byteCount = await configuration.generate(
      payload,
      spool.filePath,
      deadline.signal,
    )
    throwIfGenerationAborted(deadline.signal)
    deadline.dispose()
    deadline = undefined
    const response = await createGeneratedOutputFileResponse(
      spool,
      configuration.responseHeaders(payload),
      {
        onCancel: () => terminal.cancelled(terminalMetrics()),
        onComplete: () => terminal.completed(terminalMetrics()),
        onError: () =>
          terminal.failed(
            new Error(configuration.streamErrorMessage),
            terminalMetrics(),
          ),
      },
    )
    // The response stream now owns spool cleanup and terminal recording.
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
