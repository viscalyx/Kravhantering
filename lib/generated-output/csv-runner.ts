import type { ApplicationSettings } from '@/lib/application-settings'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { escapeCsvField } from '@/lib/export-csv'
import {
  GeneratedOutputError,
  generatedOutputErrorResponse,
  isGeneratedOutputError,
} from '@/lib/generated-output/errors'
import {
  ClientCancelledGeneratedOutputError,
  createGeneratedOutputTerminalRecorder,
  createGenerationDeadline,
  type GeneratedOutputOperation,
  GeneratedOutputTimeoutError,
  generatedOutputErrorFromTimeout,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'
import {
  acquireGeneratedOutputSpool,
  BoundedGeneratedOutputWriter,
  createGeneratedOutputFileResponse,
  type GeneratedOutputSpool,
  generatedOutputCapacitySnapshot,
} from '@/lib/generated-output/spool'
import type { RequestContext } from '@/lib/requirements/auth'

type CsvOutputSettings = Pick<
  ApplicationSettings,
  | 'csvExportConcurrencyPerNode'
  | 'csvExportMaxFileBytes'
  | 'csvExportMaxRequirements'
  | 'csvExportTimeoutSeconds'
>

export interface BoundedCsvRowWriter {
  maxItems: number
  signal: AbortSignal
  writeRow: (serializedRow: string) => Promise<void>
}

export interface RunBoundedCsvOutputOptions {
  context: RequestContext
  db: SqlServerDatabase
  generateRows: (output: BoundedCsvRowWriter) => Promise<void>
  headers: readonly string[]
  operation: Extract<GeneratedOutputOperation, `${string}_csv_export`>
  requestSignal?: AbortSignal
  responseHeaders: HeadersInit
}

export async function runBoundedCsvOutput(
  options: RunBoundedCsvOutputOptions,
): Promise<Response> {
  const terminal = createGeneratedOutputTerminalRecorder(
    options.operation,
    options.context,
  )
  let settings: CsvOutputSettings | undefined
  let spool: GeneratedOutputSpool | undefined
  let deadline: ReturnType<typeof createGenerationDeadline> | undefined
  let writer: BoundedGeneratedOutputWriter | undefined
  let itemCount = 0
  let byteCount = 0
  const terminalMetrics = () => ({
    activeCount: generatedOutputCapacitySnapshot().activeCsv,
    byteCount,
    concurrencyLimit: settings?.csvExportConcurrencyPerNode,
    itemCount,
    itemLimit: settings?.csvExportMaxRequirements,
    timeoutMs:
      settings == null ? undefined : settings.csvExportTimeoutSeconds * 1000,
  })

  try {
    settings = await getApplicationSettings(options.db)
    spool = await acquireGeneratedOutputSpool({
      concurrencyLimit: settings.csvExportConcurrencyPerNode,
      maxFileBytes: settings.csvExportMaxFileBytes,
      output: 'csv',
    })
    deadline = createGenerationDeadline(
      settings.csvExportTimeoutSeconds,
      options.requestSignal,
    )
    const csvWriter = await BoundedGeneratedOutputWriter.open(
      spool.filePath,
      settings.csvExportMaxFileBytes,
      'csv',
    )
    writer = csvWriter

    await csvWriter.write('\uFEFF')
    await csvWriter.write(
      options.headers.map(header => escapeCsvField(header)).join(';'),
    )

    const generationSignal = deadline.signal
    const maxItems = settings.csvExportMaxRequirements
    await options.generateRows({
      maxItems,
      signal: generationSignal,
      writeRow: async serializedRow => {
        throwIfGenerationAborted(generationSignal)
        if (itemCount >= maxItems) {
          throw itemLimitError(maxItems)
        }
        await csvWriter.write(`\r\n${serializedRow}`)
        itemCount += 1
      },
    })

    byteCount = await csvWriter.close()
    writer = undefined
    throwIfGenerationAborted(generationSignal)
    deadline.dispose()
    deadline = undefined

    const response = await createGeneratedOutputFileResponse(
      spool,
      options.responseHeaders,
      {
        onCancel: () => terminal.cancelled(terminalMetrics()),
        onComplete: () => terminal.completed(terminalMetrics()),
        onError: () =>
          terminal.failed(
            new Error('CSV response stream failed'),
            terminalMetrics(),
          ),
      },
    )
    spool = undefined
    return response
  } catch (error) {
    deadline?.dispose()
    deadline = undefined
    byteCount = writer?.byteCount ?? byteCount
    if (
      isGeneratedOutputError(error) &&
      error.capacityReason === 'item_limit_exceeded' &&
      error.details.limit != null
    ) {
      itemCount = Math.max(itemCount, error.details.limit + 1)
    }
    await ignoreCleanupFailure(writer?.close())
    writer = undefined
    spool?.releaseGeneration()
    await ignoreCleanupFailure(spool?.releaseSpool())
    spool = undefined
    terminal.failed(error, terminalMetrics())

    if (error instanceof GeneratedOutputTimeoutError) {
      return generatedOutputErrorResponse(
        generatedOutputErrorFromTimeout('csv', error),
      )
    }
    if (isGeneratedOutputError(error)) {
      return generatedOutputErrorResponse(error)
    }
    if (error instanceof ClientCancelledGeneratedOutputError) {
      return new Response(null, {
        headers: { 'Cache-Control': 'no-store' },
        status: 499,
      })
    }
    throw error
  } finally {
    deadline?.dispose()
    await ignoreCleanupFailure(writer?.close())
    spool?.releaseGeneration()
    await ignoreCleanupFailure(spool?.releaseSpool())
  }
}

export function createCsvItemLimitError(limit: number): GeneratedOutputError {
  return itemLimitError(limit)
}

function itemLimitError(limit: number): GeneratedOutputError {
  return new GeneratedOutputError(
    'output_limit_exceeded',
    'item_limit_exceeded',
    { limit, limitKind: 'items', output: 'csv' },
  )
}

async function ignoreCleanupFailure(
  operation: Promise<unknown> | undefined,
): Promise<void> {
  try {
    await operation
  } catch {
    // The primary generated-output response or error remains authoritative.
  }
}
