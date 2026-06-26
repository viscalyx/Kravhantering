import { describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'

const logState = vi.hoisted(() => ({
  logSanitizedError: vi.fn(),
}))

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: logState.logSanitizedError,
  }
})

import {
  canRefreshActorResponsibilityPerson,
  refreshActorResponsibilityPerson,
  scheduleActorResponsibilityPersonRefresh,
} from '@/lib/requirements/actor-responsibility-refresh'

function context(
  overrides: Partial<RequestContext['actor']> = {},
): RequestContext {
  return {
    actor: {
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      familyName: 'Lovelace',
      givenName: 'Ada',
      hsaId: 'SE5560000001-ada',
      id: 'ada-sub',
      isAuthenticated: true,
      roles: [],
      source: 'oidc',
      ...overrides,
    },
    correlationId: 'corr-test',
    requestId: 'req-test',
    source: 'rest',
  }
}

describe('actor responsibility person refresh', () => {
  it('requires a verified OIDC actor with session name fields', () => {
    expect(canRefreshActorResponsibilityPerson(context())).toBe(true)
    expect(
      canRefreshActorResponsibilityPerson(
        context({ familyName: undefined, givenName: undefined }),
      ),
    ).toBe(false)
    expect(
      canRefreshActorResponsibilityPerson(
        context({ displayName: 'Ada Lovelace', givenName: undefined }),
      ),
    ).toBe(false)
    expect(
      canRefreshActorResponsibilityPerson(context({ source: 'mcp' })),
    ).toBe(false)
  })

  it('updates only the current actor live assignment person row', async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => [
      { hsaId: 'SE5560000001-ada' },
    ])
    const db = { query } as unknown as Pick<SqlServerDatabase, 'query'>
    const refreshedAt = new Date('2026-06-13T12:00:00.000Z')

    await expect(
      refreshActorResponsibilityPerson(db, context(), refreshedAt),
    ).resolves.toBe(1)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE person'),
      ['SE5560000001-ada', 'Ada', 'Lovelace', 'ada@example.test', refreshedAt],
    )
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('FROM requirement_responsibility_people person')
    expect(sql).toContain('WHERE person.hsa_id = @0')
    expect(sql).toContain('EXISTS')
  })

  it('skips refresh without querying when the session identity is incomplete', async () => {
    const query = vi.fn()
    const db = { query } as unknown as Pick<SqlServerDatabase, 'query'>

    await expect(
      refreshActorResponsibilityPerson(db, context({ familyName: undefined })),
    ).resolves.toBe(0)

    expect(query).not.toHaveBeenCalled()
  })

  it('logs sanitized background failures without throwing', async () => {
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => {
      throw new Error('database failed with secret@example.test')
    })
    const db = { query } as unknown as SqlServerDatabase

    expect(() =>
      scheduleActorResponsibilityPersonRefresh(() => db, context()),
    ).not.toThrow()

    await vi.waitFor(() =>
      expect(logState.logSanitizedError).toHaveBeenCalledWith(
        'Failed to refresh live requirement responsibility person from session',
        expect.any(Error),
      ),
    )
  })
})
