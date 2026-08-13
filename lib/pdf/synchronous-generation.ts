import { getApplicationSettings } from '@/lib/dal/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import {
  type GeneratedOutputCapacity,
  runWithGeneratedOutputCapacity,
} from '@/lib/generated-output/capacity'
import {
  GeneratedOutputError,
  generatedOutputErrorResponse,
  isGeneratedOutputError,
} from '@/lib/generated-output/errors'
import {
  ClientCancelledGeneratedOutputError,
  createGenerationDeadline,
  GeneratedOutputTimeoutError,
  generatedOutputErrorFromTimeout,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'

export interface SynchronousPdfGenerationContext {
  capacity: GeneratedOutputCapacity
  itemLimit: number
  signal: AbortSignal
}

export function createPdfItemLimitError(limit: number): GeneratedOutputError {
  return new GeneratedOutputError(
    'output_limit_exceeded',
    'item_limit_exceeded',
    { limit, limitKind: 'items', output: 'pdf' },
  )
}

export function assertPdfItemLimit(count: number, limit: number): void {
  if (count > limit) throw createPdfItemLimitError(limit)
}

export async function runSynchronousPdfGeneration<T>(
  db: SqlServerDatabase,
  requestSignal: AbortSignal | undefined,
  work: (context: SynchronousPdfGenerationContext) => Promise<T>,
): Promise<T> {
  const settings = await getApplicationSettings(db)
  const deadline = createGenerationDeadline(
    settings.pdfReportTimeoutSeconds,
    requestSignal,
  )

  try {
    return await runWithGeneratedOutputCapacity(
      {
        concurrencyLimit: settings.pdfReportConcurrencyPerNode,
        output: 'pdf',
      },
      async capacity => {
        throwIfGenerationAborted(deadline.signal)
        const result = await work({
          capacity,
          itemLimit: settings.pdfReportMaxRequirements,
          signal: deadline.signal,
        })
        throwIfGenerationAborted(deadline.signal)
        return result
      },
    )
  } finally {
    deadline.dispose()
  }
}

export function synchronousPdfErrorResponse(
  error: unknown,
): Response | undefined {
  if (error instanceof GeneratedOutputTimeoutError) {
    return generatedOutputErrorResponse(
      generatedOutputErrorFromTimeout('pdf', error),
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
  return undefined
}
