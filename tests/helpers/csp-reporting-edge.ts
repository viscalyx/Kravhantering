import { execFileSync } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { createServer, request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Test-only TLS edge: forwards untouched native payloads and records only receipt status. */
export async function startCspReportingEdge(upstream: string): Promise<{
  origin: string
  certificateFingerprint: string
  deliveries: { status: number; media: string; customHeader: boolean }[]
  close: () => Promise<void>
}> {
  const upstreamUrl = new URL(upstream)
  const upstreamRequest =
    upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest
  const directory = await mkdtemp(join(tmpdir(), 'csp-reporting-edge-'))
  const key = join(directory, 'key.pem')
  const cert = join(directory, 'cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  const deliveries: { status: number; media: string; customHeader: boolean }[] =
    []
  const server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    (incoming, outgoing) => {
      const forwarded = upstreamRequest(
        new URL(incoming.url ?? '/', upstreamUrl),
        {
          method: incoming.method,
          headers: incoming.headers,
        },
        response => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers)
          response.pipe(outgoing)
          if (incoming.url === '/api/security/csp-reports') {
            outgoing.on('finish', () =>
              deliveries.push({
                status: response.statusCode ?? 502,
                media: String(incoming.headers['content-type']),
                customHeader: 'x-requested-with' in incoming.headers,
              }),
            )
          }
        },
      )
      forwarded.on('error', () => {
        outgoing.writeHead(502)
        outgoing.end()
      })
      incoming.pipe(forwarded)
    },
  )
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test TLS edge address')
  return {
    origin: `https://localhost:${address.port}`,
    certificateFingerprint: createHash('sha256')
      .update(
        new X509Certificate(await readFile(cert)).publicKey.export({
          type: 'spki',
          format: 'der',
        }),
      )
      .digest('base64'),
    deliveries,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
      await rm(directory, { recursive: true, force: true })
    },
  }
}
