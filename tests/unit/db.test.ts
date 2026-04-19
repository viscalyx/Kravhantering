import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type TestGlobal = typeof globalThis & {
  __kravhanteringDbCache?: Map<string, unknown>
}

function clearDbCache(): void {
  const testGlobal = globalThis as TestGlobal

  for (const db of testGlobal.__kravhanteringDbCache?.values() ?? []) {
    if (
      db &&
      typeof db === 'object' &&
      '$client' in db &&
      db.$client &&
      typeof db.$client === 'object' &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close()
    }
  }

  delete testGlobal.__kravhanteringDbCache
}

describe('lib/db', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.useRealTimers()
    clearDbCache()
  })

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    clearDbCache()
  })

  it('caches local SQLite databases but not remote proxy databases', async () => {
    const { getDb } = await import('@/lib/db')

    const localA = getDb(':memory:')
    const localB = getDb(':memory:')
    expect(localA).toBe(localB)

    const remoteA = getDb('http://127.0.0.1:9000')
    const remoteB = getDb('http://127.0.0.1:9000')
    expect(remoteA).not.toBe(remoteB)
  })

  it('resolves relative file URLs before Node normalizes them', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lib-db-relative-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

    try {
      const { getDb } = await import('@/lib/db')
      const db = getDb('file:./tmp/dev.sqlite') as unknown as {
        $client: { close(): void; name?: string }
      }

      expect(db.$client.name).toBe(resolve(tempDir, 'tmp/dev.sqlite'))
      db.$client.close()
      clearDbCache()
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('passes an AbortSignal to proxy fetches and rejects when the timeout aborts', async () => {
    vi.useFakeTimers()

    const drizzleMock = vi.fn((executeQuery, executeBatch) => ({
      executeBatch,
      executeQuery,
    }))
    vi.doMock('drizzle-orm/sqlite-proxy', () => ({
      drizzle: drizzleMock,
    }))

    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(timeoutMs => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 5)
        return controller.signal
      })

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal

      return new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('request aborted'))
          return
        }

        signal?.addEventListener(
          'abort',
          () => reject(new Error('request aborted')),
          { once: true },
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getDb } = await import('@/lib/db')
    const db = getDb('http://127.0.0.1:9000') as unknown as {
      executeQuery(
        sql: string,
        params: unknown[],
        method: 'all' | 'get' | 'run' | 'values',
      ): Promise<unknown>
    }

    const queryPromise = db.executeQuery('select 1', [], 'all')
    const queryExpectation = expect(queryPromise).rejects.toThrow(
      'request aborted',
    )
    await vi.advanceTimersByTimeAsync(5)

    await queryExpectation
    expect(timeoutSpy).toHaveBeenCalledWith(10_000)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/query',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
