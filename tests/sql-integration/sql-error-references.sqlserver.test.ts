import { describe, expect, it, vi } from 'vitest'
import { readResponseMessage } from '@/lib/http/response-message'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsLogger } from '@/lib/requirements/logging'
import { withLogging } from '@/lib/requirements/service-shared'
import { AiVerificationSqlLogger } from '@/lib/typeorm/ai-verification-sql-logger'
import {
  makeRequestContext,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

describe('SQL failure diagnostic linkage', () => {
  const database = useSqlIntegrationDatabase()

  it.each([false, true])(
    'links a real service SQL failure to HTTP and displayed references with database logging %s',
    async enabled => {
      const db = database()
      const previousLogger = db.logger
      db.logger = new AiVerificationSqlLogger(enabled ? ['error'] : false)
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        let caught: unknown
        try {
          await withLogging(
            createRequirementsLogger(),
            await makeRequestContext(),
            'requirements.read',
            {},
            () => db.query('SELECT * FROM [missing_sql_reference_fixture]'),
          )
        } catch (error) {
          caught = error
        }
        expect(caught).toBeInstanceOf(Error)
        const payload = toHttpErrorPayload(caught)
        expect(payload.status).toBe(500)
        const entries = log.mock.calls
          .map(call => JSON.parse(call[0]))
          .filter(entry => entry.event === 'sql.operation.failed')
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
          correlation_id: payload.body.correlationId,
          timestamp: payload.body.timestamp,
          error: {
            message: expect.stringContaining('missing_sql_reference_fixture'),
            stack: expect.any(String),
            sql: { number: 208 },
          },
        })
        expect(
          await readResponseMessage(Response.json(payload.body), 'en'),
        ).toContain(payload.body.correlationId)
        expect(JSON.stringify(payload)).not.toContain(
          'missing_sql_reference_fixture',
        )
        expect(await db.query('SELECT 1 AS usable')).toEqual([{ usable: 1 }])
      } finally {
        log.mockRestore()
        db.logger = previousLogger
      }
    },
  )
})
