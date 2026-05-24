import { describe, expect, it, vi } from 'vitest'

import {
  buildDemoUsersDocument,
  DEMO_USER_MARKER_ATTRIBUTE,
  DEMO_USER_MARKER_VALUE,
  main,
  mergeDemoUsersIntoRealm,
  syncLiveDemoUsers,
} from '../keycloak-demo-users.mjs'

function response(data, status = 200) {
  return {
    json: vi.fn(async () => data),
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => ''),
  }
}

function noContent() {
  return response(null, 204)
}

const devRealm = {
  realm: 'kravhantering-dev',
  users: [
    {
      attributes: { hsaId: ['SE5560000001-admin1'] },
      credentials: [{ temporary: false, type: 'password', value: 'devpass' }],
      email: 'ada.admin@example.test',
      emailVerified: true,
      enabled: true,
      firstName: 'Ada',
      lastName: 'Admin',
      realmRoles: ['Admin', 'PrivacyOfficer'],
      username: 'ada.admin',
    },
    {
      attributes: { hsaId: ['SE5560000001-reviewer1'] },
      credentials: [{ temporary: false, type: 'password', value: 'devpass' }],
      email: 'rita.reviewer@example.test',
      emailVerified: true,
      enabled: true,
      firstName: 'Rita',
      lastName: 'Reviewer',
      realmRoles: ['Reviewer'],
      username: 'rita.reviewer',
    },
  ],
}

describe('keycloak-demo-users', () => {
  it('builds a marked demo-user document from the dev realm', () => {
    const document = buildDemoUsersDocument(devRealm, {
      generatedAt: '2026-05-24T00:00:00.000Z',
    })

    expect(document).toMatchObject({
      generatedAt: '2026-05-24T00:00:00.000Z',
      markerAttribute: DEMO_USER_MARKER_ATTRIBUTE,
      markerValue: DEMO_USER_MARKER_VALUE,
      schemaVersion: 1,
      sourceRealm: 'kravhantering-dev',
    })
    expect(document.users).toHaveLength(2)
    expect(document.users[0]).toMatchObject({
      attributes: {
        hsaId: ['SE5560000001-admin1'],
        [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
      },
      credentials: [{ temporary: false, type: 'password', value: 'devpass' }],
      realmRoles: ['Admin', 'PrivacyOfficer'],
      username: 'ada.admin',
    })
  })

  it('merges demo users into a realm file and preserves unrelated users', () => {
    const document = buildDemoUsersDocument(devRealm, {
      generatedAt: '2026-05-24T00:00:00.000Z',
    })
    const merged = mergeDemoUsersIntoRealm(
      {
        realm: 'kravhantering-production',
        users: [
          { username: 'site.admin' },
          {
            attributes: {
              [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
            },
            username: 'removed.demo',
          },
          { attributes: {}, username: 'ada.admin' },
        ],
      },
      document,
    )

    expect(merged.users.map(user => user.username)).toEqual([
      'site.admin',
      'ada.admin',
      'rita.reviewer',
    ])
    expect(merged.users[1]?.attributes?.[DEMO_USER_MARKER_ATTRIBUTE]).toEqual([
      DEMO_USER_MARKER_VALUE,
    ])
  })

  it('syncs live Keycloak users by adding, updating, adopting, and deleting demo users', async () => {
    const document = buildDemoUsersDocument(devRealm, {
      generatedAt: '2026-05-24T00:00:00.000Z',
    })
    const calls = []
    const responses = [
      response({ access_token: 'admin-token' }),
      response([
        { attributes: {}, id: 'u-ada', username: 'ada.admin' },
        {
          attributes: {
            [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
          },
          id: 'u-old',
          username: 'removed.demo',
        },
        { attributes: {}, id: 'u-site', username: 'site.admin' },
      ]),
      noContent(),
      noContent(),
      noContent(),
      response({ id: 'role-admin', name: 'Admin' }),
      response({ id: 'role-privacy', name: 'PrivacyOfficer' }),
      response([{ id: 'role-reviewer', name: 'Reviewer' }]),
      noContent(),
      noContent(),
      noContent(),
      response([{ id: 'u-rita', username: 'rita.reviewer' }]),
      noContent(),
      response({ id: 'role-reviewer', name: 'Reviewer' }),
      response([]),
      noContent(),
    ]
    const fetchImpl = vi.fn(async (url, options = {}) => {
      calls.push({ body: options.body, method: options.method ?? 'GET', url })
      const next = responses.shift()
      if (!next) throw new Error(`Unexpected fetch call: ${url}`)
      return next
    })

    await expect(
      syncLiveDemoUsers({
        adminPassword: 'admin-password',
        adminUser: 'admin',
        document,
        fetchImpl,
      }),
    ).resolves.toEqual({
      adopted: 1,
      created: 1,
      deleted: 1,
      updated: 1,
    })

    expect(calls.map(call => call.method)).toEqual([
      'POST',
      'GET',
      'DELETE',
      'PUT',
      'PUT',
      'GET',
      'GET',
      'GET',
      'DELETE',
      'POST',
      'POST',
      'GET',
      'PUT',
      'GET',
      'GET',
      'POST',
    ])
    expect(JSON.parse(calls[3]?.body)).toMatchObject({
      attributes: {
        hsaId: ['SE5560000001-admin1'],
        [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
      },
    })
    expect(JSON.parse(calls[4]?.body)).toMatchObject({
      temporary: false,
      type: 'password',
      value: 'devpass',
    })
    expect(JSON.parse(calls[9]?.body).map(role => role.name)).toEqual([
      'Admin',
      'PrivacyOfficer',
    ])
    expect(JSON.parse(calls[10]?.body)).toMatchObject({
      attributes: {
        hsaId: ['SE5560000001-reviewer1'],
        [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
      },
    })
    expect(JSON.parse(calls[15]?.body).map(role => role.name)).toEqual([
      'Reviewer',
    ])
  })

  it('generates and merges through the CLI with injectable filesystem', async () => {
    const files = new Map([
      ['dev-realm.json', JSON.stringify(devRealm)],
      [
        'realm.json',
        JSON.stringify({ realm: 'kravhantering-production', users: [] }),
      ],
    ])
    const fsImpl = {
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(filePath => files.get(filePath)),
      writeFileSync: vi.fn((filePath, content) => files.set(filePath, content)),
    }
    const consoleObj = { error: vi.fn(), log: vi.fn() }

    await expect(
      main(
        ['generate', '--dev-realm', 'dev-realm.json', '--output', 'users.json'],
        {
          consoleObj,
          fsImpl,
        },
      ),
    ).resolves.toBe(0)
    await expect(
      main(
        ['merge-file', '--users', 'users.json', '--realm-file', 'realm.json'],
        { consoleObj, fsImpl },
      ),
    ).resolves.toBe(0)

    expect(JSON.parse(files.get('realm.json')).users).toHaveLength(2)
    expect(consoleObj.error).not.toHaveBeenCalled()
  })
})
