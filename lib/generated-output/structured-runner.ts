import { getApplicationSettings } from '@/lib/dal/application-settings'
import type { SqlServerDatabase } from '@/lib/db'
import { runWithExportActorQuota } from '@/lib/generated-output/actor-quota'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import {
  createGenerationDeadline,
  throwIfGenerationAborted,
} from '@/lib/generated-output/operation'
import {
  acquireGeneratedOutputSpool,
  createGeneratedOutputFileResponse,
  writeBoundedFile,
} from '@/lib/generated-output/spool'
import type { RequestContext } from '@/lib/requirements/auth'

export interface BoundedOutputCollection {
  itemLimitError: (limit: number) => GeneratedOutputError
  maxItems: number
  query: SqlServerDatabase['query']
  signal: AbortSignal
  transaction<T>(
    isolation: 'SERIALIZABLE',
    collect: (db: Pick<SqlServerDatabase, 'query'>) => Promise<T>,
  ): Promise<T>
}

export async function runBoundedStructuredOutput(options: {
  db: SqlServerDatabase
  context: RequestContext
  output: 'csv' | 'json'
  requestSignal?: AbortSignal
  headers?: HeadersInit
  collect: (collection: BoundedOutputCollection) => Promise<unknown>
}): Promise<Response> {
  return runWithExportActorQuota(
    options.db,
    options.context,
    options.output,
    options.requestSignal,
    async signal => {
      const settings = await getApplicationSettings(options.db)
      const spool = await acquireGeneratedOutputSpool({
        concurrencyLimit: settings.csvExportConcurrencyPerNode,
        maxFileBytes: settings.csvExportMaxFileBytes,
        output: options.output,
      })
      const failedCollection = new AbortController()
      const deadline = createGenerationDeadline(
        settings.csvExportTimeoutSeconds,
        AbortSignal.any([signal, failedCollection.signal]),
      )
      let pendingQueries = Promise.resolve()
      let transferred = false
      const itemLimitError = (limit: number) =>
        new GeneratedOutputError(
          'output_limit_exceeded',
          'item_limit_exceeded',
          { output: options.output, limit, limitKind: 'items' },
        )
      let remaining = settings.csvExportMaxItems
      const boundedQuery =
        (
          executor: Pick<SqlServerDatabase, 'query'>,
        ): SqlServerDatabase['query'] =>
        // This read-only executor caps every result before it reaches the collector.
        async (sql: string, parameters: unknown[] = []) => {
          const query = pendingQueries.then(async () => {
            throwIfGenerationAborted(deadline.signal)
            // Archive collectors issue SELECT statements. A TOP bound avoids
            // connection-level SET options leaking into the shared SQL pool.
            const select = /^\s*SELECT(?:\s+TOP\s*\(\s*(\d+)\s*\))?\s+/iu.exec(
              sql,
            )
            if (!select)
              throw new Error(
                'Bounded output collection requires a SELECT query',
              )
            const limit = Math.min(
              remaining + 1,
              select[1] ? Number(select[1]) : remaining + 1,
            )
            const boundedSql = `SELECT TOP (@${parameters.length}) ${sql.slice(select[0].length)}`
            const rows = await executor.query(boundedSql, [
              ...parameters,
              limit,
            ])
            throwIfGenerationAborted(deadline.signal)
            if (Array.isArray(rows)) {
              remaining -= rows.length
              if (remaining < 0)
                throw itemLimitError(settings.csvExportMaxItems)
            }
            return rows
          })
          pendingQueries = query.then(
            () => {},
            error => {
              failedCollection.abort(error)
            },
          )
          return query
        }
      try {
        const payload = await options.collect({
          maxItems: settings.csvExportMaxItems,
          signal: deadline.signal,
          itemLimitError,
          query: boundedQuery(options.db),
          transaction: (isolation, collect) =>
            options.db.transaction(isolation, async manager => {
              try {
                const result = await collect({ query: boundedQuery(manager) })
                throwIfGenerationAborted(deadline.signal)
                return result
              } finally {
                // Finish queued reads before TypeORM commits or rolls back the connection.
                await pendingQueries
              }
            }),
        })
        throwIfGenerationAborted(deadline.signal)
        const chunks =
          options.output === 'csv'
            ? ['\uFEFF', String(payload)]
            : serializeJsonChunks(payload)
        await writeBoundedFile(
          spool.filePath,
          chunks,
          settings.csvExportMaxFileBytes,
          options.output,
          deadline.signal,
        )
        throwIfGenerationAborted(deadline.signal)
        const response = await createGeneratedOutputFileResponse(spool, {
          'Content-Type':
            options.output === 'json'
              ? 'application/json;charset=utf-8'
              : 'text/csv;charset=utf-8',
          ...Object.fromEntries(new Headers(options.headers)),
        })
        transferred = true
        return response
      } finally {
        failedCollection.abort()
        await pendingQueries
        deadline.dispose()
        if (!transferred) {
          spool.releaseGeneration()
          await spool.releaseSpool()
        }
      }
    },
  )
}

export function* serializeJsonChunks(value: unknown): Generator<string> {
  if (Array.isArray(value)) {
    yield '['
    for (const [index, item] of value.entries()) {
      if (index > 0) yield ','
      yield* serializeJsonChunks(item === undefined ? null : item)
    }
    yield ']'
  } else if (value && typeof value === 'object' && !(value instanceof Date)) {
    yield '{'
    let emitted = 0
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      if (emitted++ > 0) yield ','
      yield JSON.stringify(key)
      yield ':'
      yield* serializeJsonChunks(item)
    }
    yield '}'
  } else yield JSON.stringify(value) ?? 'null'
}
