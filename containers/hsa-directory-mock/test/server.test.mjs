import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer, loadFixtures } from '../src/server.mjs'

const SOAP_URL = '/svr-hsaws2/hsaws'
const REST_LOOKUP_URL = '/hsa/person-records/lookup'

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

async function postRestLookup(body) {
  const response = await fetch(`${baseUrl}${REST_LOOKUP_URL}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  return {
    body: await response.json(),
    status: response.status,
  }
}

describe('HSA directory SOAP mock', () => {
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

  it('looks up a person through the REST contract used by Kong in dev', async () => {
    const response = await postRestLookup({ hsaId: 'SE5560000001-annaj' })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      email: 'anna.johansson@example.test',
      givenName: 'Anna',
      hsaId: 'SE5560000001-annaj',
      middleName: null,
      surname: 'Johansson',
    })
  })

  it('looks up Maria Svensson from existing seed test data through REST', async () => {
    const response = await postRestLookup({ hsaId: 'SE5560000001-marias' })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      email: 'maria.svensson@example.test',
      givenName: 'Maria',
      hsaId: 'SE5560000001-marias',
      middleName: null,
      surname: 'Svensson',
    })
  })

  it('accepts multiple REST HSA records when normalized person fields match', async () => {
    const response = await postRestLookup({ hsaId: 'SE1000-MULTI' })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      email: 'kalle@sos.se',
      givenName: 'Kalle',
      hsaId: 'SE1000-MULTI',
      middleName: 'Bson',
      surname: 'Karlsson',
    })
  })

  it('returns 404 for missing REST HSA identities', async () => {
    const response = await postRestLookup({ hsaId: 'SE1000-NOTFOUND' })

    assert.equal(response.status, 404)
    assert.equal(response.body.code, 'not_found')
  })

  it('returns 409 for conflicting REST HSA records', async () => {
    const response = await postRestLookup({ hsaId: 'SE1000-CONFLICT' })

    assert.equal(response.status, 409)
    assert.equal(response.body.code, 'conflict')
  })
})
