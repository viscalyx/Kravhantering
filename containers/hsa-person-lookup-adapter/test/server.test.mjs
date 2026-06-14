import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  createServer as createMockServer,
  loadFixtures,
} from '../../hsa-directory-mock/src/server.mjs'
import { generateCertificates } from '../src/generate-certs.mjs'
import {
  createServer,
  mapSoapPeopleToRest,
  parseGetHsaPersonResponse,
  soapRequestXml,
} from '../src/server.mjs'

const SOAP_URL = '/svr-hsaws2/hsaws'

let adapterBaseUrl
let adapterServer
let certDir
let certificates
let mockBaseUrl
let mockServer

before(async () => {
  certDir = await mkdtemp(path.join(tmpdir(), 'hsa-adapter-certs-'))
  certificates = await generateCertificates({ outputDir: certDir })
  mockServer = createMockServer(await loadFixtures(), {
    authConfig: { mode: 'realistic-mtls' },
    tlsOptions: {
      ca: await readFile(certificates.caCert),
      cert: await readFile(certificates.serverCert),
      key: await readFile(certificates.serverKey),
      rejectUnauthorized: false,
      requestCert: true,
    },
  })
  mockBaseUrl = await listen(mockServer, 'https')

  adapterServer = createServer({
    caPath: certificates.caCert,
    certPath: certificates.clientCert,
    endpointUrl: `${mockBaseUrl}${SOAP_URL}`,
    keyPath: certificates.clientKey,
    timeoutMs: 5000,
    to: 'SE165565594230-1000',
  })
  adapterBaseUrl = await listen(adapterServer, 'http')
})

after(async () => {
  await stop(adapterServer)
  await stop(mockServer)
  await rm(certDir, { force: true, recursive: true })
})

async function listen(server, protocol) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  return `${protocol}://127.0.0.1:${address.port}`
}

async function stop(server) {
  await new Promise(resolve => server.close(resolve))
}

async function postLookup(hsaId) {
  return postLookupAt(adapterBaseUrl, hsaId)
}

async function postLookupAt(baseUrl, hsaId) {
  const body = JSON.stringify({ hsaId })
  const url = new URL(`${baseUrl}/hsa/person-records/lookup`)
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers: {
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json',
        },
        hostname: url.hostname,
        method: 'POST',
        path: url.pathname,
        port: Number(url.port),
      },
      response => {
        const chunks = []
        response.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          resolve({
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            status: response.statusCode ?? 0,
          })
        })
      },
    )
    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

function successEnvelope(userInformations) {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<hsa:GetHsaPersonResponse xmlns:hsa="urn:riv:hsa:HsaWsResponder:3">',
    '<hsa:userInformations>',
    userInformations,
    '</hsa:userInformations>',
    '</hsa:GetHsaPersonResponse>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('')
}

describe('HSA person lookup adapter SOAP mapping', () => {
  it('generates dynamic server SANs and owner-only private key permissions', async () => {
    const customCertDir = await mkdtemp(path.join(tmpdir(), 'hsa-certs-'))
    try {
      const generated = await generateCertificates({
        outputDir: customCertDir,
        serverDns: 'hsa.example.test',
      })
      const serverExt = await readFile(
        path.join(customCertDir, 'server.ext'),
        'utf8',
      )
      assert.match(serverExt, /DNS:hsa\.example\.test/u)
      assert.match(serverExt, /DNS:hsa-directory-mock/u)
      assert.match(serverExt, /DNS:localhost/u)

      for (const file of [
        generated.caKey,
        generated.clientKey,
        generated.serverKey,
      ]) {
        assert.equal((await stat(file)).mode & 0o777, 0o600)
      }
      for (const file of [
        generated.caCert,
        generated.clientCert,
        generated.serverCert,
      ]) {
        assert.equal((await stat(file)).mode & 0o777, 0o644)
      }
    } finally {
      await rm(customCertDir, { force: true, recursive: true })
    }
  })

  it('constructs GetHsaPerson SOAP requests with the configured addressing target', () => {
    const xml = soapRequestXml('SE1000-004', { messageId: 'test-id', to: 'TO' })

    assert.match(xml, /<add:MessageID>test-id<\/add:MessageID>/u)
    assert.match(xml, /<add:To>TO<\/add:To>/u)
    assert.match(xml, /<urn:GetHsaPerson>/u)
    assert.match(xml, /<urn:hsaIdentity>SE1000-004<\/urn:hsaIdentity>/u)
    assert.match(xml, /<urn:searchBase>c=SE<\/urn:searchBase>/u)
  })

  it('parses userInformation and maps hsaProtectedPerson', () => {
    const people = parseGetHsaPersonResponse(
      successEnvelope(
        [
          '<hsa:userInformation>',
          '<hsa:hsaIdentity>SE1000-PROTECTED</hsa:hsaIdentity>',
          '<hsa:givenName>Signe</hsa:givenName>',
          '<hsa:sn>Sekretess</hsa:sn>',
          '<hsa:mail>signe.sekretess@example.test</hsa:mail>',
          '<hsa:hsaProtectedPerson>true</hsa:hsaProtectedPerson>',
          '</hsa:userInformation>',
        ].join(''),
      ),
    )

    assert.deepEqual(people, [
      {
        email: 'signe.sekretess@example.test',
        givenName: 'Signe',
        hasProtectedPersonalData: true,
        hsaId: 'SE1000-PROTECTED',
        middleName: null,
        surname: 'Sekretess',
      },
    ])
  })

  it('maps multiple normalized SOAP records to one REST person', () => {
    const person = mapSoapPeopleToRest(
      [
        {
          email: 'kalle@sos.se',
          givenName: 'Kalle',
          hasProtectedPersonalData: false,
          hsaId: 'SE1000-MULTI',
          middleName: 'Bson',
          surname: 'Karlsson',
        },
        {
          email: 'KALLE@SOS.SE',
          givenName: 'Kalle',
          hasProtectedPersonalData: false,
          hsaId: 'SE1000-MULTI',
          middleName: 'Bson',
          surname: 'Karlsson',
        },
      ],
      'SE1000-MULTI',
    )

    assert.equal(person.hsaId, 'SE1000-MULTI')
  })

  it('raises conflict for different normalized SOAP records', () => {
    assert.throws(
      () =>
        mapSoapPeopleToRest(
          [
            {
              email: 'kalle@sos.se',
              givenName: 'Kalle',
              hasProtectedPersonalData: false,
              hsaId: 'SE1000-CONFLICT',
              middleName: null,
              surname: 'Karlsson',
            },
            {
              email: 'karin@sos.se',
              givenName: 'Karin',
              hasProtectedPersonalData: false,
              hsaId: 'SE1000-CONFLICT',
              middleName: null,
              surname: 'Karlsson',
            },
          ],
          'SE1000-CONFLICT',
        ),
      /conflicting/u,
    )
  })
})

describe('HSA person lookup adapter REST facade', () => {
  it('looks up a person through SOAP over mTLS', async () => {
    const response = await postLookup('SE5560000001-annaj')

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      email: 'anna.johansson@example.test',
      givenName: 'Anna',
      hasProtectedPersonalData: false,
      hsaId: 'SE5560000001-annaj',
      middleName: null,
      surname: 'Johansson',
    })
  })

  it('returns hasProtectedPersonalData from HSA hsaProtectedPerson', async () => {
    const response = await postLookup('SE1000-PROTECTED')

    assert.equal(response.status, 200)
    assert.equal(response.body.hasProtectedPersonalData, true)
  })

  it('maps empty SOAP userInformations to REST 404', async () => {
    const response = await postLookup('SE1000-NOTFOUND')

    assert.equal(response.status, 404)
    assert.equal(response.body.code, 'not_found')
  })

  it('maps conflicting SOAP records to REST 409', async () => {
    const response = await postLookup('SE1000-CONFLICT')

    assert.equal(response.status, 409)
    assert.equal(response.body.code, 'conflict')
  })

  it('maps non-2xx SOAP responses with bodies to REST 503', async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('upstream error')
    })
    const upstreamBaseUrl = await listen(upstream, 'http')
    const adapter = createServer({
      endpointUrl: `${upstreamBaseUrl}${SOAP_URL}`,
      timeoutMs: 5000,
      to: 'SE165565594230-1000',
    })
    const localAdapterBaseUrl = await listen(adapter, 'http')
    try {
      const response = await postLookupAt(
        localAdapterBaseUrl,
        'SE5560000001-annaj',
      )

      assert.equal(response.status, 503)
      assert.equal(response.body.code, 'service_unavailable')
    } finally {
      await stop(adapter)
      await stop(upstream)
    }
  })
})
