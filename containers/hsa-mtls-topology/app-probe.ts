import http from 'node:http'

import { createHsaCorrelationId } from '@/lib/hsa/correlation.mjs'
import {
  loadStrictHsaPersonLookupSnapshot,
  lookupHsaPersonStrict,
} from '@/lib/hsa/strict-person-lookup'

const snapshot = await loadStrictHsaPersonLookupSnapshot()
if (!snapshot) throw new Error('Strict App HSA lookup is not configured')

http
  .createServer(async (request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"status":"ok"}')
      return
    }
    if (request.method !== 'POST' || request.url !== '/lookup') {
      response.writeHead(404).end()
      return
    }
    try {
      const correlationId = createHsaCorrelationId()
      const person = await lookupHsaPersonStrict('SE5560000001-marias', {
        snapshot,
        uuid: () => correlationId,
      })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ correlationId, person }))
    } catch {
      response.writeHead(503, { 'Content-Type': 'application/json' })
      response.end('{"code":"service_unavailable"}')
    }
  })
  .listen(8081, '0.0.0.0')
