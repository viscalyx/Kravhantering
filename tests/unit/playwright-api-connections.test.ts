// @vitest-environment node
import { once } from 'node:events'
import { createServer } from 'node:http'
import { request } from '@playwright/test'
import { expect, it } from 'vitest'
import { closeIntegrationApiConnections } from '@/tests/support/playwright-api-connections'

it('opens a fresh API connection without retrying writes or changing other origins', async () => {
  const remotePorts: number[] = []
  const integrationApp = createServer((req, res) => {
    if (req.socket.remotePort) remotePorts.push(req.socket.remotePort)
    if (req.method === 'PATCH') res.statusCode = 409
    res.end()
  })
  const otherServer = createServer((_, res) => res.end())
  integrationApp.listen(0, '127.0.0.1')
  otherServer.listen(0, '127.0.0.1')
  await Promise.all([
    once(integrationApp, 'listening'),
    once(otherServer, 'listening'),
  ])
  const appAddress = integrationApp.address()
  const otherAddress = otherServer.address()
  if (
    !appAddress ||
    typeof appAddress === 'string' ||
    !otherAddress ||
    typeof otherAddress === 'string'
  ) {
    throw new Error('Expected test servers on TCP ports')
  }

  const baseURL = `http://127.0.0.1:${appAddress.port}`
  const unsubscribe = closeIntegrationApiConnections(baseURL)
  const api = await request.newContext({ baseURL })
  try {
    const lookup = await api.get('/setup')
    const mutation = await api.patch('/change', { data: { status: 1 } })
    expect(lookup.headers().connection).toBe('close')
    expect(mutation.headers().connection).toBe('close')
    expect(mutation.status()).toBe(409)
    expect(remotePorts).toHaveLength(2)
    expect(new Set(remotePorts).size).toBe(2)
    const other = await api.get(`http://127.0.0.1:${otherAddress.port}/`)
    expect(other.headers().connection).toBe('keep-alive')
  } finally {
    await api.dispose()
    unsubscribe()
    integrationApp.close()
    otherServer.close()
  }
})
