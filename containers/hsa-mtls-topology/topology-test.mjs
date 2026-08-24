import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import {
  loadStrictHsaPersonLookupSnapshot,
  lookupHsaPersonStrict,
} from './strict-person-lookup.mjs'

const LOOKUP_PATH = '/hsa/person-records/lookup'
const EXPECTED_HSA_ID = 'SE5560000001-marias'

function request({
  body = JSON.stringify({ hsaId: EXPECTED_HSA_ID }),
  ca = '/runtime/app/kong-server-ca.crt',
  cert,
  contentType = 'application/json',
  host = 'kong',
  key,
  maxVersion,
  minVersion = 'TLSv1.2',
  path = LOOKUP_PATH,
  port = 8443,
  servername = 'kong',
} = {}) {
  const correlationId = randomUUID()
  return new Promise((resolve, reject) => {
    const call = https.request(
      {
        ca: fs.readFileSync(ca),
        ...(cert ? { cert: fs.readFileSync(cert) } : {}),
        headers: {
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': contentType,
          'X-Kravhantering-HSA-Correlation-ID': correlationId,
        },
        host,
        key: key ? fs.readFileSync(key) : undefined,
        method: 'POST',
        ...(maxVersion ? { maxVersion } : {}),
        minVersion,
        path,
        port,
        rejectUnauthorized: true,
        servername,
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            correlationId,
            status: response.statusCode,
          }),
        )
      },
    )
    call.on('error', reject)
    call.end(body)
  })
}

function plainRequest({ host, port }) {
  return new Promise((resolve, reject) => {
    const call = http.request(
      { host, method: 'GET', path: '/health', port },
      resolve,
    )
    call.on('error', reject)
    call.end()
  })
}

async function eventually(action) {
  let lastError
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  throw lastError
}

if (process.env.HSA_MTLS_FORCE_VERIFY_FAILURE === 'true') {
  throw new Error('Injected post-rotation verification failure')
}

const snapshot = await loadStrictHsaPersonLookupSnapshot()
if (!snapshot)
  throw new Error('Strict App transport contract is not configured')
const expectedServerRejection = process.env.HSA_MTLS_EXPECT_SERVER_REJECTION
if (expectedServerRejection) {
  if (expectedServerRejection !== 'app-to-kong') {
    await eventually(async () => {
      const response = await request({
        cert: '/runtime/probe/wrong-app-client.crt',
        key: '/runtime/probe/wrong-app-client.key',
      })
      if (response.status !== 403) {
        throw new Error('Kong ingress authorization is not ready')
      }
    })
  }
  let rejected = false
  try {
    await lookupHsaPersonStrict(EXPECTED_HSA_ID, {
      snapshot,
      uuid: () => randomUUID(),
    })
  } catch {
    rejected = true
  }
  if (!rejected) {
    throw new Error(
      `Same-domain wrong server identity was accepted on ${expectedServerRejection}`,
    )
  }
  console.log(
    JSON.stringify({
      event: 'hsa_deployed_client_wrong_server_rejected',
      trust_domain: expectedServerRejection,
    }),
  )
  process.exit(0)
}
const appResult = await eventually(async () => {
  const correlationId = randomUUID()
  const person = await lookupHsaPersonStrict(EXPECTED_HSA_ID, {
    snapshot,
    uuid: () => correlationId,
  })
  if (person.hsaId !== EXPECTED_HSA_ID || person.givenName !== 'Maria') {
    throw new Error('Authenticated strict topology lookup failed')
  }
  return { correlationId, person }
})

for (const credentials of [
  {},
  {
    cert: '/runtime/adapter/adapter-client.crt',
    key: '/runtime/adapter/adapter-client.key',
  },
]) {
  let rejected = false
  try {
    const response = await request(credentials)
    rejected = response.status !== 200
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('Unauthenticated or cross-leg request passed')
}

for (const probe of [
  {
    ca: '/runtime/probe/adapter-server-ca.crt',
    host: 'adapter',
    name: 'kong-to-adapter unauthenticated',
    servername: 'hsa-person-lookup-adapter',
  },
  {
    ca: '/runtime/probe/hsa-server-ca.crt',
    host: 'mock',
    name: 'adapter-to-hsa unauthenticated',
    path: '/svr-hsaws2/hsaws',
    servername: 'hsa-directory-mock',
  },
  {
    ca: '/runtime/probe/adapter-server-ca.crt',
    cert: '/runtime/app/app-client.crt',
    host: 'adapter',
    key: '/runtime/app/app-client.key',
    name: 'app-to-kong credential on kong-to-adapter',
    servername: 'hsa-person-lookup-adapter',
  },
  {
    ca: '/runtime/probe/kong-server-ca.crt',
    cert: '/runtime/kong/kong-client.crt',
    key: '/runtime/kong/kong-client.key',
    name: 'kong-to-adapter credential on app-to-kong',
  },
  {
    ca: '/runtime/probe/adapter-server-ca.crt',
    cert: '/runtime/adapter/adapter-client.crt',
    host: 'adapter',
    key: '/runtime/adapter/adapter-client.key',
    name: 'adapter-to-hsa credential on kong-to-adapter',
    servername: 'hsa-person-lookup-adapter',
  },
  {
    ca: '/runtime/probe/hsa-server-ca.crt',
    cert: '/runtime/kong/kong-client.crt',
    host: 'mock',
    key: '/runtime/kong/kong-client.key',
    name: 'kong-to-adapter credential on adapter-to-hsa',
    path: '/svr-hsaws2/hsaws',
    servername: 'hsa-directory-mock',
  },
  {
    ca: '/runtime/probe/hsa-server-ca.crt',
    cert: '/runtime/app/app-client.crt',
    host: 'mock',
    key: '/runtime/app/app-client.key',
    name: 'app-to-kong credential on adapter-to-hsa',
    path: '/svr-hsaws2/hsaws',
    servername: 'hsa-directory-mock',
  },
]) {
  let rejected = false
  try {
    const response = await request(probe)
    rejected = response.status !== 200
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error(`${probe.name} was accepted`)
}

const authenticatedLegs = [
  {
    ca: '/runtime/app/kong-server-ca.crt',
    cert: '/runtime/app/app-client.crt',
    key: '/runtime/app/app-client.key',
    name: 'app-to-kong',
  },
  {
    ca: '/runtime/kong/adapter-server-ca.crt',
    cert: '/runtime/kong/kong-client.crt',
    host: 'adapter',
    key: '/runtime/kong/kong-client.key',
    name: 'kong-to-adapter',
    servername: 'hsa-person-lookup-adapter',
  },
  {
    body: '<not-a-business-request/>',
    ca: '/runtime/adapter/hsa-server-ca.crt',
    cert: '/runtime/adapter/adapter-client.crt',
    contentType: 'text/xml; charset=utf-8',
    host: 'mock',
    key: '/runtime/adapter/adapter-client.key',
    name: 'adapter-to-hsa',
    path: '/svr-hsaws2/hsaws',
    servername: 'hsa-directory-mock',
  },
]

for (const probe of authenticatedLegs) {
  await request({ ...probe, maxVersion: 'TLSv1.2' })
  let obsoleteRejected = false
  try {
    await request({ ...probe, maxVersion: 'TLSv1.1', minVersion: 'TLSv1.1' })
  } catch (error) {
    const rejectedByPeer =
      error?.code === 'EPROTO' &&
      /tlsv1 alert protocol version/iu.test(error.message)
    const unavailableInClient =
      error?.code === 'ERR_SSL_NO_PROTOCOLS_AVAILABLE' &&
      /no protocols available/iu.test(error.message)
    if (!rejectedByPeer && !unavailableInClient) {
      throw error
    }
    obsoleteRejected = true
  }
  if (!obsoleteRejected)
    throw new Error(`TLS 1.1 was accepted on ${probe.name}`)
}

for (const endpoint of [
  { host: 'adapter', port: 8081 },
  { host: 'mock', port: 8081 },
  { host: 'kong', port: 8001 },
]) {
  let externallyRejected = false
  try {
    await plainRequest(endpoint)
  } catch {
    externallyRejected = true
  }
  if (!externallyRejected) {
    throw new Error(
      `Loopback or admin listener was externally reachable on ${endpoint.host}:${endpoint.port}`,
    )
  }
}

for (const probe of [
  {
    ca: '/runtime/probe/kong-server-ca.crt',
    cert: '/runtime/probe/wrong-app-client.crt',
    key: '/runtime/probe/wrong-app-client.key',
    name: 'app-to-kong',
  },
  {
    ca: '/runtime/probe/adapter-server-ca.crt',
    cert: '/runtime/probe/wrong-kong-client.crt',
    host: 'adapter',
    key: '/runtime/probe/wrong-kong-client.key',
    name: 'kong-to-adapter',
    servername: 'hsa-person-lookup-adapter',
  },
  {
    body: '<not-reached/>',
    ca: '/runtime/probe/hsa-server-ca.crt',
    cert: '/runtime/probe/wrong-adapter-client.crt',
    contentType: 'text/xml; charset=utf-8',
    host: 'mock',
    key: '/runtime/probe/wrong-adapter-client.key',
    name: 'adapter-to-hsa',
    path: '/svr-hsaws2/hsaws',
    servername: 'hsa-directory-mock',
  },
]) {
  const response = await request(probe)
  if (response.status !== 403) {
    throw new Error(
      `Correct-CA wrong stable identity was not rejected on ${probe.name}`,
    )
  }
}

console.log(
  JSON.stringify({
    correlation_id: appResult.correlationId,
    event: 'hsa_topology_verified',
    handling_count: 1,
    negative_rejections: 9,
    tls_1_2_authenticated_legs: 3,
    tls_1_1_rejections: 3,
    loopback_listener_rejections: 3,
    wrong_identity_rejections: 3,
  }),
)
