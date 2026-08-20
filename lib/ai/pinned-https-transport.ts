import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import type { AiPinnedTlsRequest } from './connection-trust'

const MAX_ADMIN_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_ADMIN_REQUEST_MS = 15_000

type HttpsRequest = typeof httpsRequest

function requestBody(
  value: BodyInit | null | undefined,
): string | Uint8Array | null {
  if (value == null) return null
  if (typeof value === 'string' || value instanceof Uint8Array) return value
  throw new Error(
    'The pinned AI administration transport rejected the body type.',
  )
}

export function createPinnedHttpsFetch(
  request: HttpsRequest = httpsRequest,
): (input: Readonly<AiPinnedTlsRequest>) => Promise<Response> {
  return async input => {
    const address = input.resolvedAddresses[0]
    if (!address || !isIP(address)) {
      throw new Error('The pinned AI administration address is invalid.')
    }
    const url = new URL(input.url)
    if (url.protocol !== 'https:') {
      throw new Error(
        'The production AI administration transport requires HTTPS.',
      )
    }
    const body = requestBody(input.init.body)
    return new Promise<Response>((resolve, reject) => {
      const outgoing = request(
        url,
        {
          headers: Object.fromEntries(
            new Headers(input.init.headers).entries(),
          ),
          lookup: (_hostname, _options, callback) => {
            const family = isIP(address)
            if (_options.all) {
              callback(null, [{ address, family }])
              return
            }
            callback(null, address, family)
          },
          method: input.init.method,
          servername: input.serverName,
          signal: input.init.signal ?? undefined,
        },
        incoming => {
          const chunks: Buffer[] = []
          let length = 0
          incoming.on('data', (chunk: Buffer) => {
            length += chunk.byteLength
            if (length > MAX_ADMIN_RESPONSE_BYTES) {
              incoming.destroy(
                new Error('AI administration response too large.'),
              )
              return
            }
            chunks.push(chunk)
          })
          incoming.on('error', reject)
          incoming.on('end', () => {
            const headers = new Headers()
            for (const [name, value] of Object.entries(incoming.headers)) {
              if (Array.isArray(value)) {
                for (const item of value) headers.append(name, item)
              } else if (value !== undefined) {
                headers.set(name, String(value))
              }
            }
            resolve(
              new Response(Buffer.concat(chunks), {
                headers,
                status: incoming.statusCode ?? 500,
                statusText: incoming.statusMessage,
              }),
            )
          })
        },
      )
      outgoing.on('error', reject)
      if (!input.init.signal) {
        outgoing.setTimeout(MAX_ADMIN_REQUEST_MS, () => {
          outgoing.destroy(
            new Error('The pinned AI administration request timed out.'),
          )
        })
      }
      const abort = (): void => {
        outgoing.destroy(
          new Error('The pinned AI administration request was aborted.'),
        )
      }
      input.init.signal?.addEventListener('abort', abort, { once: true })
      outgoing.once('close', () =>
        input.init.signal?.removeEventListener('abort', abort),
      )
      if (input.init.signal?.aborted) abort()
      if (body !== null) outgoing.write(body)
      outgoing.end()
    })
  }
}
