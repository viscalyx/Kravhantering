import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isHsaId } from '@/lib/auth/hsa-id'

type KeycloakRealmClient = {
  attributes?: Record<string, string>
  clientId?: string
  publicClient?: boolean
  protocolMappers?: Array<{
    name?: string
    config?: Record<string, string>
    protocolMapper?: string
  }>
  redirectUris?: string[]
  secret?: string
  serviceAccountsEnabled?: boolean
  standardFlowEnabled?: boolean
  webOrigins?: string[]
}

type KeycloakRealm = {
  clients?: KeycloakRealmClient[]
  enabled?: boolean
  realm?: string
  roles?: {
    realm?: Array<{
      name?: string
    }>
  }
  sslRequired?: string
  users?: Array<{
    attributes?: Record<string, string[]>
    credentials?: Array<{
      temporary?: boolean
      type?: string
      value?: string
    }>
    realmRoles?: string[]
    username?: string
  }>
}

function readRealm(relativePath: string) {
  return JSON.parse(
    readFileSync(join(process.cwd(), relativePath), 'utf8'),
  ) as KeycloakRealm
}

function readDevRealm() {
  return readRealm('dev/keycloak/realm-kravhantering-dev.json')
}

function readContainerRealm() {
  return readRealm('containers/keycloak/realm-kravhantering-test.json')
}

function getClient(realm: KeycloakRealm, clientId: string) {
  return realm.clients?.find(client => client.clientId === clientId)
}

function getMapper(client: KeycloakRealmClient | undefined, name: string) {
  return client?.protocolMappers?.find(mapper => mapper.name === name)
}

function expectWebClaimMappers(client: KeycloakRealmClient | undefined) {
  const rolesMapper = getMapper(client, 'roles-as-json-array')
  expect(rolesMapper?.protocolMapper).toBe('oidc-usermodel-realm-role-mapper')
  expect(rolesMapper?.config).toMatchObject({
    'access.token.claim': 'true',
    'claim.name': 'roles',
    'id.token.claim': 'true',
    multivalued: 'true',
    'userinfo.token.claim': 'true',
  })

  const hsaMapper = getMapper(client, 'employeeHsaId-claim')
  expect(hsaMapper?.protocolMapper).toBe('oidc-usermodel-attribute-mapper')
  expect(hsaMapper?.config).toMatchObject({
    'access.token.claim': 'true',
    'claim.name': 'employeeHsaId',
    'id.token.claim': 'true',
    'user.attribute': 'hsaId',
    'userinfo.token.claim': 'true',
  })
}

describe('dev Keycloak realm', () => {
  it('contains only the committed dev, prodlike, and MCP clients', () => {
    const realm = readDevRealm()
    expect(realm.clients?.map(client => client.clientId)).toEqual([
      'kravhantering-prodlike',
      'kravhantering-app',
      'kravhantering-mcp',
    ])
  })

  it('keeps the browser clients scoped to their localhost ports', () => {
    const realm = readDevRealm()

    const prodlikeClient = getClient(realm, 'kravhantering-prodlike')
    expect(prodlikeClient?.secret).toBe('prodlike-kc-app-secret')
    expect(prodlikeClient?.redirectUris).toEqual([
      'http://localhost:3001/api/auth/callback',
    ])
    expect(prodlikeClient?.webOrigins).toEqual(['http://localhost:3001'])
    expect(prodlikeClient?.attributes?.['post.logout.redirect.uris']).toBe(
      'http://localhost:3001/',
    )
    expectWebClaimMappers(prodlikeClient)

    const devClient = getClient(realm, 'kravhantering-app')
    expect(devClient?.redirectUris).toEqual([
      'http://localhost:3000/api/auth/callback',
    ])
    expect(devClient?.webOrigins).toEqual(['http://localhost:3000'])
    expect(devClient?.attributes?.['post.logout.redirect.uris']).toBe(
      'http://localhost:3000/',
    )
    expectWebClaimMappers(devClient)
  })

  it('emits the expected audience and real-format HSA-ID for MCP tokens', () => {
    const realm = readDevRealm()
    const mcpClient = getClient(realm, 'kravhantering-mcp')

    const audienceMapper = getMapper(mcpClient, 'mcp-audience')
    expect(audienceMapper?.protocolMapper).toBe('oidc-audience-mapper')
    expect(audienceMapper?.config).toMatchObject({
      'access.token.claim': 'true',
      'id.token.claim': 'false',
      'included.client.audience': 'kravhantering-app',
    })

    const hsaMapper = getMapper(mcpClient, 'mcp-employeeHsaId')
    const employeeHsaId = hsaMapper?.config?.['claim.value']

    expect(hsaMapper?.protocolMapper).toBe('oidc-hardcoded-claim-mapper')
    expect(hsaMapper?.config?.['access.token.claim']).toBe('true')
    expect(employeeHsaId).toBe('SE5560000001-mcp1')
    expect(isHsaId(employeeHsaId)).toBe(true)
  })

  it('keeps canonical realm roles and all documented fixture users', () => {
    const realm = readDevRealm()
    expect(realm.roles?.realm?.map(role => role.name)).toEqual([
      'Reviewer',
      'Admin',
      'PrivacyOfficer',
    ])

    const users = realm.users?.map(user => ({
      hsaId: user.attributes?.hsaId?.[0],
      roles: user.realmRoles ?? [],
      username: user.username,
    }))

    expect(users).toEqual([
      {
        hsaId: 'SE5560000001-areaowner1',
        roles: [],
        username: 'olle.areaowner',
      },
      {
        hsaId: 'SE5560000001-areaco1',
        roles: [],
        username: 'cora.coauthor',
      },
      {
        hsaId: 'SE5560000001-linneab',
        roles: [],
        username: 'linnea.areaowner',
      },
      {
        hsaId: 'SE5560000001-specresp1',
        roles: [],
        username: 'petra.specresp',
      },
      {
        hsaId: 'SE5560000001-pkgco1',
        roles: [],
        username: 'paul.pkgcoauthor',
      },
      {
        hsaId: 'SE5560000001-reviewer1',
        roles: ['Reviewer'],
        username: 'rita.reviewer',
      },
      {
        hsaId: 'SE5560000001-admin1',
        roles: ['Admin', 'PrivacyOfficer'],
        username: 'ada.admin',
      },
      {
        hsaId: 'SE5560000001-admin2',
        roles: ['Admin'],
        username: 'only.admin',
      },
      {
        hsaId: 'SE5560000001-privacy1',
        roles: ['PrivacyOfficer'],
        username: 'disa.privacy',
      },
      {
        hsaId: 'SE5560000001-kalle1',
        roles: [],
        username: 'kalle.one',
      },
      {
        hsaId: 'SE5560000001-kalle2',
        roles: [],
        username: 'kalle.two',
      },
      {
        hsaId: 'SE5560000001-noroles1',
        roles: [],
        username: 'noah.noroles',
      },
    ])
    for (const user of users ?? []) {
      expect(isHsaId(user.hsaId)).toBe(true)
    }
  })
})

describe('container Keycloak realm', () => {
  it('targets the kravhantering.test issuer realm', () => {
    const realm = readContainerRealm()

    expect(realm.realm).toBe('kravhantering-test')
    expect(realm.enabled).toBe(true)
    expect(realm.sslRequired).toBe('external')
  })

  it('contains only the container app and MCP clients', () => {
    const realm = readContainerRealm()

    expect(realm.clients?.map(client => client.clientId)).toEqual([
      'kravhantering-app',
      'kravhantering-mcp',
    ])
  })

  it('keeps the app client scoped to the public HTTPS stack URL', () => {
    const realm = readContainerRealm()
    const appClient = getClient(realm, 'kravhantering-app')

    expect(appClient?.publicClient).toBe(false)
    expect(appClient?.standardFlowEnabled).toBe(true)
    expect(appClient?.secret).toBe(
      'container-demo-app-secret-not-for-production',
    )
    expect(appClient?.redirectUris).toEqual([
      'https://kravhantering.test/api/auth/callback',
    ])
    expect(appClient?.webOrigins).toEqual(['https://kravhantering.test'])
    expect(appClient?.attributes?.['post.logout.redirect.uris']).toBe(
      'https://kravhantering.test/',
    )
    expect(appClient?.attributes?.['pkce.code.challenge.method']).toBe('S256')
    expectWebClaimMappers(appClient)
  })

  it('emits the expected MCP audience and real-format HSA-ID', () => {
    const realm = readContainerRealm()
    const mcpClient = getClient(realm, 'kravhantering-mcp')

    expect(mcpClient?.publicClient).toBe(false)
    expect(mcpClient?.standardFlowEnabled).toBe(false)
    expect(mcpClient?.serviceAccountsEnabled).toBe(true)

    const audienceMapper = getMapper(mcpClient, 'mcp-audience')
    expect(audienceMapper?.protocolMapper).toBe('oidc-audience-mapper')
    expect(audienceMapper?.config).toMatchObject({
      'access.token.claim': 'true',
      'id.token.claim': 'false',
      'included.client.audience': 'kravhantering-app',
    })

    const hsaMapper = getMapper(mcpClient, 'mcp-employeeHsaId')
    const employeeHsaId = hsaMapper?.config?.['claim.value']

    expect(hsaMapper?.protocolMapper).toBe('oidc-hardcoded-claim-mapper')
    expect(hsaMapper?.config?.['access.token.claim']).toBe('true')
    expect(employeeHsaId).toBe('SE5560000001-mcp1')
    expect(isHsaId(employeeHsaId)).toBe(true)
  })

  it('keeps canonical roles and minimal smoke users', () => {
    const realm = readContainerRealm()

    expect(realm.roles?.realm?.map(role => role.name)).toEqual([
      'Reviewer',
      'Admin',
      'PrivacyOfficer',
    ])

    const users = realm.users?.map(user => ({
      hsaId: user.attributes?.hsaId?.[0],
      password: user.credentials?.[0]?.value,
      roles: user.realmRoles ?? [],
      username: user.username,
    }))

    expect(users).toEqual([
      {
        hsaId: 'SE5560000001-smoke1',
        password: 'release-smoke-user-not-for-production',
        roles: [],
        username: 'release-smoke-user',
      },
      {
        hsaId: 'SE5560000001-smoke2',
        password: 'release-smoke-admin-not-for-production',
        roles: ['Admin'],
        username: 'release-smoke-admin',
      },
    ])
    for (const user of users ?? []) {
      expect(isHsaId(user.hsaId)).toBe(true)
    }
  })
})
