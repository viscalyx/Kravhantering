import { afterEach, describe, expect, it } from 'vitest'
import {
  buildFixtureLookup,
  createFixtureServer,
  hsaRecordToLookupPayload,
  LOOKUP_PATH,
  parseArgs,
} from '../ci-hsa-person-lookup-fixture.mjs'

const servers = []

function listen(server) {
  servers.push(server)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Expected an IPv4 server address.'))
        return
      }
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function close(server) {
  return new Promise(resolve => {
    server.close(() => resolve())
  })
}

describe('CI HSA person lookup fixture', () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => close(server)))
  })

  it('maps HSA directory fixture records to the REST lookup contract', () => {
    expect(
      hsaRecordToLookupPayload({
        givenName: 'Ada',
        hsaIdentity: 'SE5560000001-admin1',
        hsaProtectedPerson: 'true',
        mail: 'ada.admin@example.test',
        sn: 'Admin',
      }),
    ).toEqual({
      email: 'ada.admin@example.test',
      givenName: 'Ada',
      hasProtectedPersonalData: true,
      hsaId: 'SE5560000001-admin1',
      middleName: null,
      surname: 'Admin',
    })
  })

  it('looks up unique people and maps missing identities to not_found', () => {
    const lookup = buildFixtureLookup({
      hsaPersonRecords: [
        {
          givenName: 'Ada',
          hsaIdentity: 'SE5560000001-admin1',
          mail: 'ada.admin@example.test',
          sn: 'Admin',
        },
      ],
      notFoundIdentities: ['SE1000-NOTFOUND'],
    })

    expect(lookup.lookup('SE5560000001-admin1')).toMatchObject({
      body: { hsaId: 'SE5560000001-admin1' },
      status: 200,
    })
    expect(lookup.lookup('SE1000-NOTFOUND')).toMatchObject({
      body: { code: 'not_found' },
      status: 404,
    })
  })

  it('maps duplicate HSA records to conflict', () => {
    const lookup = buildFixtureLookup({
      hsaPersonRecords: [
        { givenName: 'Ada', hsaIdentity: 'SE1000-CONFLICT', sn: 'Admin' },
        { givenName: 'Ava', hsaIdentity: 'SE1000-CONFLICT', sn: 'Admin' },
      ],
    })

    expect(lookup.lookup('SE1000-CONFLICT')).toMatchObject({
      body: { code: 'conflict' },
      status: 409,
    })
  })

  it('serves health and lookup responses over HTTP', async () => {
    const lookup = buildFixtureLookup({
      hsaPersonRecords: [
        {
          givenName: 'Ada',
          hsaIdentity: 'SE5560000001-admin1',
          mail: 'ada.admin@example.test',
          sn: 'Admin',
        },
      ],
    })
    const baseUrl = await listen(createFixtureServer(lookup))

    const health = await fetch(`${baseUrl}/health`)
    await expect(health.json()).resolves.toEqual({
      ok: true,
      personCount: 1,
    })

    const response = await fetch(`${baseUrl}${LOOKUP_PATH}`, {
      body: JSON.stringify({ hsaId: 'SE5560000001-admin1' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      email: 'ada.admin@example.test',
      givenName: 'Ada',
      hsaId: 'SE5560000001-admin1',
      surname: 'Admin',
    })
  })

  it('rejects malformed lookup requests', async () => {
    const baseUrl = await listen(createFixtureServer(buildFixtureLookup({})))
    const response = await fetch(`${baseUrl}${LOOKUP_PATH}`, {
      body: '{',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'bad_request',
    })
  })

  it('parses command line overrides', () => {
    expect(
      parseArgs([
        '--fixture',
        'fixtures.json',
        '--host=0.0.0.0',
        '--port',
        '9000',
      ]),
    ).toEqual({
      fixturePath: 'fixtures.json',
      host: '0.0.0.0',
      port: 9000,
    })
  })
})
