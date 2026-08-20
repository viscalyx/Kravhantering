import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createPinnedHttpsFetch } from '@/lib/ai/pinned-https-transport'

interface FakeIncoming extends EventEmitter {
  destroy: ReturnType<typeof vi.fn>
  headers: Record<string, string | string[] | undefined>
  statusCode?: number
  statusMessage?: string
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    init: { headers: { accept: 'application/json' }, method: 'GET' },
    resolvedAddresses: ['93.184.216.34'],
    serverName: 'ai.example.test',
    url: 'https://ai.example.test/v1/models',
    ...overrides,
  }
}

describe('pinned HTTPS transport', () => {
  it('pins DNS, forwards a bounded response, and preserves repeated headers', async () => {
    const incoming = new EventEmitter() as FakeIncoming
    incoming.headers = {
      'content-type': 'application/json',
      'set-cookie': ['one=1', 'two=2'],
      unused: undefined,
    }
    incoming.statusCode = 200
    incoming.statusMessage = 'OK'
    incoming.destroy = vi.fn()
    const outgoing = new EventEmitter() as EventEmitter & {
      end: () => void
      setTimeout: ReturnType<typeof vi.fn>
      write: ReturnType<typeof vi.fn>
    }
    outgoing.write = vi.fn()
    outgoing.setTimeout = vi.fn()
    outgoing.end = () => {
      incoming.emit('data', Buffer.from('{"ok":true}'))
      incoming.emit('end')
    }
    const request = vi.fn((_url, options, callback) => {
      options.lookup('ignored', {}, (error: unknown, address: string) => {
        expect(error).toBeNull()
        expect(address).toBe('93.184.216.34')
      })
      options.lookup(
        'ignored',
        { all: true },
        (
          error: unknown,
          addresses: Array<{ address: string; family: number }>,
        ) => {
          expect(error).toBeNull()
          expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }])
        },
      )
      callback(incoming)
      return outgoing
    })
    const fetchPinned = createPinnedHttpsFetch(request as never)

    const response = await fetchPinned(
      input({
        init: {
          body: 'request-body',
          headers: { accept: 'application/json' },
          method: 'POST',
        },
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(outgoing.write).toHaveBeenCalledWith('request-body')
  })

  it('rejects invalid targets and unsupported bodies before opening a socket', async () => {
    const request = vi.fn()
    const fetchPinned = createPinnedHttpsFetch(request as never)
    await expect(
      fetchPinned(input({ resolvedAddresses: [] }) as never),
    ).rejects.toThrow('address is invalid')
    await expect(
      fetchPinned(input({ url: 'http://ai.example.test/v1' }) as never),
    ).rejects.toThrow('requires HTTPS')
    await expect(
      fetchPinned(
        input({ init: { body: new FormData(), method: 'POST' } }) as never,
      ),
    ).rejects.toThrow('body type')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects oversized and transport-error responses', async () => {
    const incoming = new EventEmitter() as FakeIncoming
    incoming.headers = {}
    incoming.destroy = vi.fn(error => incoming.emit('error', error))
    const outgoing = new EventEmitter() as EventEmitter & {
      end: () => void
      setTimeout: ReturnType<typeof vi.fn>
      write: ReturnType<typeof vi.fn>
    }
    outgoing.write = vi.fn()
    outgoing.setTimeout = vi.fn()
    outgoing.end = () => {
      incoming.emit('data', Buffer.alloc(4 * 1024 * 1024 + 1))
    }
    const request = vi.fn((_url, _options, callback) => {
      callback(incoming)
      return outgoing
    })
    await expect(
      createPinnedHttpsFetch(request as never)(input() as never),
    ).rejects.toThrow('response too large')

    const failedOutgoing = new EventEmitter() as EventEmitter & {
      end: () => void
      setTimeout: ReturnType<typeof vi.fn>
      write: ReturnType<typeof vi.fn>
    }
    failedOutgoing.write = vi.fn()
    failedOutgoing.setTimeout = vi.fn()
    failedOutgoing.end = () => failedOutgoing.emit('error', new Error('socket'))
    const failedRequest = vi.fn(() => failedOutgoing)
    await expect(
      createPinnedHttpsFetch(failedRequest as never)(input() as never),
    ).rejects.toThrow('socket')
  })

  it('force-closes a hanging pinned socket when its deadline signal aborts', async () => {
    const controller = new AbortController()
    const outgoing = new EventEmitter() as EventEmitter & {
      destroy: ReturnType<typeof vi.fn>
      end: () => void
      write: ReturnType<typeof vi.fn>
    }
    outgoing.write = vi.fn()
    outgoing.end = vi.fn()
    outgoing.destroy = vi.fn(error => outgoing.emit('error', error))
    const request = vi.fn(() => outgoing)
    const pending = createPinnedHttpsFetch(request as never)(
      input({ init: { method: 'GET', signal: controller.signal } }) as never,
    )

    controller.abort()

    await expect(pending).rejects.toThrow('was aborted')
    expect(outgoing.destroy).toHaveBeenCalledOnce()
  })

  it('force-closes a hanging pinned socket at the default timeout', async () => {
    let timeoutCallback: (() => void) | undefined
    const outgoing = new EventEmitter() as EventEmitter & {
      destroy: ReturnType<typeof vi.fn>
      end: ReturnType<typeof vi.fn>
      setTimeout: ReturnType<typeof vi.fn>
      write: ReturnType<typeof vi.fn>
    }
    outgoing.write = vi.fn()
    outgoing.end = vi.fn()
    outgoing.destroy = vi.fn(error => outgoing.emit('error', error))
    outgoing.setTimeout = vi.fn((_milliseconds, callback) => {
      timeoutCallback = callback
      return outgoing
    })
    const request = vi.fn(() => outgoing)
    const pending = createPinnedHttpsFetch(request as never)(input() as never)

    expect(outgoing.setTimeout).toHaveBeenCalledWith(
      15_000,
      expect.any(Function),
    )
    timeoutCallback?.()

    await expect(pending).rejects.toThrow('timed out')
    expect(outgoing.destroy).toHaveBeenCalledOnce()
  })
})
