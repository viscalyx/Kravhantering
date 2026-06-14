import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  generateCertificates,
  generateClientCertificate,
} from '../../hsa-person-lookup-adapter/src/generate-certs.mjs'
import {
  createServer,
  loadFixtures,
  readAuthConfig,
  startServer,
} from '../src/server.mjs'

const SOAP_URL = '/svr-hsaws2/hsaws'

let server
let baseUrl

before(async () => {
  server = createServer(await loadFixtures())
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise(resolve => server.close(resolve))
})

function envelope(body, header = defaultHeader()) {
  return [
    '<soap:Envelope',
    ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
    ' xmlns:add="http://www.w3.org/2005/08/addressing"',
    ' xmlns:urn="urn:riv:hsa:HsaWsResponder:3">',
    header,
    '<soap:Body>',
    body,
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('')
}

function defaultHeader() {
  return [
    '<soap:Header>',
    '<add:MessageID>test-message</add:MessageID>',
    '<add:To>SE165565594230-1000</add:To>',
    '</soap:Header>',
  ].join('')
}

function getHsaPerson(inner) {
  return `<urn:GetHsaPerson>${inner}</urn:GetHsaPerson>`
}

async function postSoap(xml) {
  const response = await fetch(`${baseUrl}${SOAP_URL}`, {
    body: xml,
    headers: {
      Accept: 'text/xml',
      'Content-Type': 'text/xml; charset=utf-8',
    },
    method: 'POST',
  })
  return {
    body: await response.text(),
    status: response.status,
  }
}

describe('HSA directory SOAP mock', () => {
  it('rejects unsupported authentication modes during configuration and startup', async () => {
    assert.throws(
      () => readAuthConfig({ HSA_MOCK_AUTH_MODE: 'bad-mode' }),
      /Unsupported HSA_MOCK_AUTH_MODE "bad-mode"/u,
    )
    await assert.rejects(
      () =>
        startServer({
          authConfig: { mode: 'bad-mode' },
          host: '127.0.0.1',
          port: 0,
        }),
      /Unsupported HSA_MOCK_AUTH_MODE "bad-mode"/u,
    )
  })

  it('serves a health endpoint', async () => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })

  it('looks up an HSA person record by hsaIdentity', async () => {
    const response = await postSoap(
      envelope(
        getHsaPerson(
          '<urn:hsaIdentity>SE1000-004</urn:hsaIdentity><urn:searchBase>c=SE</urn:searchBase>',
        ),
      ),
    )

    assert.equal(response.status, 200)
    assert.match(
      response.body,
      /<hsa:hsaIdentity>SE1000-004<\/hsa:hsaIdentity>/u,
    )
    assert.match(response.body, /<hsa:givenName>Kalle<\/hsa:givenName>/u)
    assert.match(response.body, /<hsa:mail>kalle@sos.se<\/hsa:mail>/u)
  })

  it('looks up an HSA person record by personalIdentityNumber', async () => {
    const response = await postSoap(
      envelope(
        getHsaPerson(
          '<urn:personalIdentityNumber>191212121212</urn:personalIdentityNumber>',
        ),
      ),
    )

    assert.equal(response.status, 200)
    assert.match(
      response.body,
      /<hsa:hsaIdentity>SE1000-004<\/hsa:hsaIdentity>/u,
    )
  })

  it('returns an empty userInformations wrapper for a not found HSA identity', async () => {
    const response = await postSoap(
      envelope(
        getHsaPerson('<urn:hsaIdentity>SE1000-NOTFOUND</urn:hsaIdentity>'),
      ),
    )

    assert.equal(response.status, 200)
    assert.match(response.body, /<hsa:userInformations\/>/u)
  })

  it('omits optional mail when the HSA person record has no e-mail address', async () => {
    const response = await postSoap(
      envelope(getHsaPerson('<urn:hsaIdentity>SE1000-005</urn:hsaIdentity>')),
    )

    assert.equal(response.status, 200)
    assert.match(
      response.body,
      /<hsa:hsaIdentity>SE1000-005<\/hsa:hsaIdentity>/u,
    )
    assert.doesNotMatch(response.body, /<hsa:mail>/u)
  })

  it('returns multiple userInformation elements for a multi-hit fixture', async () => {
    const response = await postSoap(
      envelope(getHsaPerson('<urn:hsaIdentity>SE1000-MULTI</urn:hsaIdentity>')),
    )

    assert.equal(response.status, 200)
    assert.equal(response.body.match(/<hsa:userInformation>/gu)?.length, 2)
  })

  it('returns SOAP Fault code 3 when both identifiers are supplied', async () => {
    const response = await postSoap(
      envelope(
        getHsaPerson(
          [
            '<urn:hsaIdentity>SE1000-004</urn:hsaIdentity>',
            '<urn:personalIdentityNumber>191212121212</urn:personalIdentityNumber>',
          ].join(''),
        ),
      ),
    )

    assert.equal(response.status, 500)
    assert.match(response.body, /<hsa:code>3<\/hsa:code>/u)
  })

  it('returns SOAP Fault code 3 when no identifier is supplied', async () => {
    const response = await postSoap(envelope(getHsaPerson('')))

    assert.equal(response.status, 500)
    assert.match(response.body, /<hsa:code>3<\/hsa:code>/u)
  })

  it('returns SOAP Fault code 6 for unsupported searchBase', async () => {
    const response = await postSoap(
      envelope(
        getHsaPerson(
          '<urn:hsaIdentity>SE1000-004</urn:hsaIdentity><urn:searchBase>o=Unsupported,c=SE</urn:searchBase>',
        ),
      ),
    )

    assert.equal(response.status, 500)
    assert.match(response.body, /<hsa:code>6<\/hsa:code>/u)
  })

  it('parses requests by namespace URI and local name instead of prefix', async () => {
    const response = await postSoap(
      [
        '<env:Envelope',
        ' xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"',
        ' xmlns:wsa="http://www.w3.org/2005/08/addressing"',
        ' xmlns:hsa="urn:riv:hsa:HsaWsResponder:3">',
        '<env:Header>',
        '<wsa:MessageID>prefix-test</wsa:MessageID>',
        '<wsa:To>SE165565594230-1000</wsa:To>',
        '</env:Header>',
        '<env:Body>',
        '<hsa:GetHsaPerson>',
        '<hsa:hsaIdentity>SE1000-004</hsa:hsaIdentity>',
        '</hsa:GetHsaPerson>',
        '</env:Body>',
        '</env:Envelope>',
      ].join(''),
    )

    assert.equal(response.status, 200)
    assert.match(
      response.body,
      /<hsa:hsaIdentity>SE1000-004<\/hsa:hsaIdentity>/u,
    )
  })

  it('returns SOAP Fault code 3 for an invalid WS-Addressing To value', async () => {
    const response = await postSoap(
      envelope(
        getHsaPerson('<urn:hsaIdentity>SE1000-004</urn:hsaIdentity>'),
        [
          '<soap:Header>',
          '<add:MessageID>bad-to</add:MessageID>',
          '<add:To>wrong</add:To>',
          '</soap:Header>',
        ].join(''),
      ),
    )

    assert.equal(response.status, 500)
    assert.match(response.body, /<hsa:code>3<\/hsa:code>/u)
  })

  it('rejects unsupported methods on the SOAP endpoint', async () => {
    const response = await fetch(`${baseUrl}${SOAP_URL}`)

    assert.equal(response.status, 405)
    assert.equal(response.headers.get('allow'), 'POST')
  })

  it('does not expose the REST person lookup facade', async () => {
    const response = await fetch(`${baseUrl}/hsa/person-records/lookup`, {
      body: JSON.stringify({ hsaId: 'SE5560000001-annaj' }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    assert.equal(response.status, 404)
  })
})

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  return `https://127.0.0.1:${address.port}`
}

async function stop(server) {
  await new Promise(resolve => server.close(resolve))
}

async function serverTlsOptions(certificates) {
  return {
    ca: await readFile(certificates.caCert),
    cert: await readFile(certificates.serverCert),
    key: await readFile(certificates.serverKey),
    rejectUnauthorized: false,
    requestCert: true,
  }
}

async function postSoapOverTls(url, certificates, xml, client = {}) {
  const parsed = new URL(`${url}${SOAP_URL}`)
  const options = {
    ca: await readFile(certificates.caCert),
    headers: {
      Accept: 'text/xml',
      'Content-Length': Buffer.byteLength(xml),
      'Content-Type': 'text/xml; charset=utf-8',
    },
    hostname: parsed.hostname,
    method: 'POST',
    path: parsed.pathname,
    port: Number(parsed.port),
  }
  if (client.cert && client.key) {
    options.cert = await readFile(client.cert)
    options.key = await readFile(client.key)
  }

  return new Promise((resolve, reject) => {
    const request = https.request(options, response => {
      const chunks = []
      response.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      response.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          status: response.statusCode ?? 0,
        })
      })
    })
    request.on('error', reject)
    request.write(xml)
    request.end()
  })
}

async function signedClient(certificates, outputDir, name, serialNumber) {
  const client = await generateClientCertificate({
    caCert: certificates.caCert,
    caKey: certificates.caKey,
    clientSerialNumber: serialNumber,
    name,
    outputDir,
  })
  return { cert: client.clientCert, key: client.clientKey }
}

describe('HSA directory mock mTLS caller authorization', () => {
  let authBaseUrl
  let authServer
  let certDir
  let certificates
  let clients

  before(async () => {
    certDir = await mkdtemp(path.join(tmpdir(), 'hsa-mock-certs-'))
    certificates = await generateCertificates({ outputDir: certDir })
    clients = {
      active: {
        cert: certificates.clientCert,
        key: certificates.clientKey,
      },
      inactive: await signedClient(
        certificates,
        certDir,
        'inactive-client',
        'SE5560000000-INACTIVE',
      ),
      missingMethod: await signedClient(
        certificates,
        certDir,
        'missing-method-client',
        'SE5560000000-NO-GET-HSA-PERSON',
      ),
      missingSerialNumber: await signedClient(
        certificates,
        certDir,
        'missing-serial-client',
        undefined,
      ),
      missingService: await signedClient(
        certificates,
        certDir,
        'missing-service-client',
        'SE5560000000-NO-HSAWS2',
      ),
      unknown: await signedClient(
        certificates,
        certDir,
        'unknown-client',
        'SE5560000000-UNKNOWN',
      ),
    }

    authServer = createServer(await loadFixtures(), {
      authConfig: { mode: 'realistic-mtls' },
      tlsOptions: await serverTlsOptions(certificates),
    })
    authBaseUrl = await listen(authServer)
  })

  after(async () => {
    await stop(authServer)
    await rm(certDir, { force: true, recursive: true })
  })

  async function postWith(client) {
    return postSoapOverTls(
      authBaseUrl,
      certificates,
      envelope(getHsaPerson('<urn:hsaIdentity>SE1000-004</urn:hsaIdentity>')),
      client,
    )
  }

  it('rejects missing client certificates', async () => {
    const response = await postWith()

    assert.equal(response.status, 401)
    assert.equal(JSON.parse(response.body).code, 'missing_client_certificate')
  })

  it('requires subject.serialNumber on the client certificate', async () => {
    const response = await postWith(clients.missingSerialNumber)

    assert.equal(response.status, 401)
    assert.equal(JSON.parse(response.body).code, 'missing_client_serial_number')
  })

  it('rejects unknown caller systems', async () => {
    const response = await postWith(clients.unknown)

    assert.equal(response.status, 403)
    assert.equal(JSON.parse(response.body).code, 'unknown_caller_system')
  })

  it('rejects inactive caller systems', async () => {
    const response = await postWith(clients.inactive)

    assert.equal(response.status, 403)
    assert.equal(JSON.parse(response.body).code, 'inactive_caller_system')
  })

  it('requires hsaws2 entitlement', async () => {
    const response = await postWith(clients.missingService)

    assert.equal(response.status, 403)
    assert.equal(JSON.parse(response.body).code, 'missing_hsaws2_entitlement')
  })

  it('requires GetHsaPerson entitlement', async () => {
    const response = await postWith(clients.missingMethod)

    assert.equal(response.status, 403)
    assert.equal(
      JSON.parse(response.body).code,
      'missing_get_hsa_person_entitlement',
    )
  })

  it('allows a trusted active caller with hsaws2 and GetHsaPerson entitlement', async () => {
    const response = await postWith(clients.active)

    assert.equal(response.status, 200)
    assert.match(
      response.body,
      /<hsa:hsaIdentity>SE1000-004<\/hsa:hsaIdentity>/u,
    )
  })
})
