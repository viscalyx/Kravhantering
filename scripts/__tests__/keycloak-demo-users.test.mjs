import { describe, expect, it, vi } from 'vitest'

import {
  buildDemoUsersDocument,
  clearDemoUsers,
  DEMO_USER_MARKER_ATTRIBUTE,
  DEMO_USER_MARKER_VALUE,
  main,
  mergeDemoUsersIntoRealm,
  normalizeDemoUsersDocument,
  syncDemoUsers,
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

  it('rejects duplicate usernames before merging or syncing', () => {
    const document = buildDemoUsersDocument(devRealm, {
      generatedAt: '2026-05-24T00:00:00.000Z',
    })

    expect(() =>
      normalizeDemoUsersDocument({
        ...document,
        users: [
          ...document.users,
          {
            ...document.users[0],
            firstName: 'Duplicate',
          },
        ],
      }),
    ).toThrow('Demo users document contains duplicate username(s): ada.admin')
  })

  it('syncs running Keycloak users by adding, updating, adopting, and deleting demo users', async () => {
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
      syncDemoUsers({
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

  it('clears only marked demo users from running Keycloak', async () => {
    const calls = []
    const responses = [
      response({ access_token: 'admin-token' }),
      response([
        {
          attributes: {
            [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
          },
          id: 'u-demo',
          username: 'ada.admin',
        },
        { attributes: {}, id: 'u-site', username: 'site.admin' },
      ]),
      noContent(),
    ]
    const fetchImpl = vi.fn(async (url, options = {}) => {
      calls.push({ method: options.method ?? 'GET', url })
      const next = responses.shift()
      if (!next) throw new Error(`Unexpected fetch call: ${url}`)
      return next
    })

    await expect(
      clearDemoUsers({
        adminPassword: 'admin-password',
        adminUser: 'admin',
        fetchImpl,
      }),
    ).resolves.toEqual({ deleted: 1 })

    expect(calls.map(call => call.method)).toEqual(['POST', 'GET', 'DELETE'])
    expect(calls[2]?.url).toContain('/users/u-demo')
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

  it('syncs running Keycloak demo users through the CLI', async () => {
    const document = buildDemoUsersDocument(devRealm, {
      generatedAt: '2026-05-24T00:00:00.000Z',
    })
    const files = new Map([['users.json', JSON.stringify(document)]])
    const fsImpl = {
      readFileSync: vi.fn(filePath => files.get(filePath)),
    }
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const responses = [
      response({ access_token: 'admin-token' }),
      response([]),
      noContent(),
      response([{ id: 'u-ada', username: 'ada.admin' }]),
      noContent(),
      response({ id: 'role-admin', name: 'Admin' }),
      response({ id: 'role-privacy', name: 'PrivacyOfficer' }),
      response([]),
      noContent(),
      noContent(),
      response([{ id: 'u-rita', username: 'rita.reviewer' }]),
      noContent(),
      response({ id: 'role-reviewer', name: 'Reviewer' }),
      response([]),
      noContent(),
    ]
    const fetchImpl = vi.fn(async () => {
      const next = responses.shift()
      if (!next) throw new Error('Unexpected fetch call')
      return next
    })

    await expect(
      main(['demo-users:sync', '--users', 'users.json'], {
        consoleObj,
        env: {
          KEYCLOAK_ADMIN: 'admin',
          KEYCLOAK_ADMIN_PASSWORD: 'admin-password',
        },
        fetchImpl,
        fsImpl,
      }),
    ).resolves.toBe(0)

    expect(consoleObj.error).not.toHaveBeenCalled()
    expect(consoleObj.log).toHaveBeenCalledWith(
      'Synced demo users (created 2, updated 0, adopted 0, deleted 0).',
    )
  })

  it('requires confirmation before clearing demo users through the CLI', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }

    await expect(
      main(['demo-users:clear'], {
        consoleObj,
        env: {
          KEYCLOAK_ADMIN: 'admin',
          KEYCLOAK_ADMIN_PASSWORD: 'admin-password',
        },
      }),
    ).resolves.toBe(1)

    expect(consoleObj.error).toHaveBeenCalledWith(
      'demo-users:clear requires --confirm-clear-demo-users. This deletes marked Keycloak demo users.',
    )
  })

  it('clears demo users through the CLI with explicit confirmation', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }
    const responses = [
      response({ access_token: 'admin-token' }),
      response([
        {
          attributes: {
            [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
          },
          id: 'u-demo',
          username: 'ada.admin',
        },
      ]),
      noContent(),
    ]
    const fetchImpl = vi.fn(async () => {
      const next = responses.shift()
      if (!next) throw new Error('Unexpected fetch call')
      return next
    })

    await expect(
      main(['demo-users:clear', '--confirm-clear-demo-users'], {
        consoleObj,
        env: {
          KEYCLOAK_ADMIN: 'admin',
          KEYCLOAK_ADMIN_PASSWORD: 'admin-password',
        },
        fetchImpl,
      }),
    ).resolves.toBe(0)

    expect(consoleObj.error).not.toHaveBeenCalled()
    expect(consoleObj.log).toHaveBeenCalledWith(
      'Cleared demo users (deleted 1).',
    )
  })

  it('rejects the removed sync-live command', async () => {
    const consoleObj = { error: vi.fn(), log: vi.fn() }

    await expect(
      main(['sync-live', '--users', 'users.json'], { consoleObj }),
    ).resolves.toBe(1)

    expect(consoleObj.error).toHaveBeenLastCalledWith(
      expect.stringContaining('demo-users:sync'),
    )
  })
})
