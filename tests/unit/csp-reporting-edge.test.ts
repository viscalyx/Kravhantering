import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import {
  createServer as createHttpServer,
  type RequestListener,
} from 'node:http'
import {
  createServer as createHttpsServer,
  globalAgent,
  request,
} from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startCspReportingEdge } from '../helpers/csp-reporting-edge'

describe('CSP reporting edge forwarding', () => {
  let directory: string
  let cert: Buffer
  let key: Buffer
  const originalCa = globalAgent.options.ca

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'csp-upstream-test-'))
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
      ],
      { stdio: 'ignore' },
    )
    cert = await readFile(join(directory, 'cert.pem'))
    key = await readFile(join(directory, 'key.pem'))
    // Trust this fixture's upstream certificate; forwarding still validates TLS.
    globalAgent.options.ca = cert
  })

  afterAll(async () => {
    globalAgent.options.ca = originalCa
    await rm(directory, { recursive: true, force: true })
  })

  it.each(['http', 'https'])(
    'preserves reports and responses through an %s upstream',
    async protocol => {
      const received: unknown[] = []
      const listener: RequestListener = (incoming, outgoing) => {
        let body = ''
        incoming.setEncoding('utf8')
        incoming.on('data', chunk => {
          body += chunk
        })
        incoming.on('end', () => {
          received.push({
            method: incoming.method,
            path: incoming.url,
            media: incoming.headers['content-type'],
            body,
          })
          outgoing.writeHead(202, { 'content-type': 'text/plain' })
          outgoing.end('accepted')
        })
      }
      const upstream =
        protocol === 'https'
          ? createHttpsServer({ cert, key }, listener)
          : createHttpServer(listener)
      await new Promise<void>(resolve =>
        upstream.listen(0, '127.0.0.1', resolve),
      )
      const address = upstream.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing upstream address')
      const edge = await startCspReportingEdge(
        `${protocol}://localhost:${address.port}`,
      )
      const payload =
        '[{"type":"csp-violation","body":{"blockedURL":"inline"}}]'
      try {
        const response = await new Promise<{
          status: number | undefined
          media: string | undefined
          body: string
        }>((resolve, reject) => {
          const forwarded = request(
            `${edge.origin}/api/security/csp-reports`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/reports+json' },
              // Only the client-facing, ephemeral test edge uses a self-signed certificate.
              rejectUnauthorized: false,
            },
            incoming => {
              let body = ''
              incoming.setEncoding('utf8')
              incoming.on('data', chunk => {
                body += chunk
              })
              incoming.on('end', () =>
                resolve({
                  status: incoming.statusCode,
                  media: incoming.headers['content-type'],
                  body,
                }),
              )
            },
          )
          forwarded.on('error', reject)
          forwarded.end(payload)
        })
        expect(response).toEqual({
          status: 202,
          media: 'text/plain',
          body: 'accepted',
        })
        expect(received).toEqual([
          {
            method: 'POST',
            path: '/api/security/csp-reports',
            media: 'application/reports+json',
            body: payload,
          },
        ])
        expect(edge.deliveries).toEqual([
          {
            status: 202,
            media: 'application/reports+json',
            customHeader: false,
          },
        ])
      } finally {
        await edge.close()
        upstream.closeAllConnections()
        await new Promise<void>((resolve, reject) =>
          upstream.close(error => (error ? reject(error) : resolve())),
        )
      }
    },
  )
})
