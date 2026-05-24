import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEMO_USERS_SCHEMA_VERSION = 1
export const DEMO_USER_MARKER_ATTRIBUTE = 'kravhanteringDemoUser'
export const DEMO_USER_MARKER_VALUE = 'true'
export const DEFAULT_DEMO_USERS_PATH =
  'keycloak/demo-users.not-for-production.json'
export const DEFAULT_DEV_REALM_PATH =
  'dev/keycloak/realm-kravhantering-dev.json'
export const DEFAULT_KEYCLOAK_BASE_URL = 'http://keycloak:8080'
export const DEFAULT_KEYCLOAK_REALM = 'kravhantering-production'
export const MANAGED_REALM_ROLES = ['Reviewer', 'Admin', 'PrivacyOfficer']

const USAGE = `Usage:
  node scripts/keycloak-demo-users.mjs generate --dev-realm <path> --output <path>
  node scripts/keycloak-demo-users.mjs merge-file --users <path> --realm-file <path> [--output <path>]
  node scripts/keycloak-demo-users.mjs sync-live --users <path> [--base-url <url>] [--realm <realm>] [--admin-user <user>] [--admin-password <password>]
  node scripts/keycloak-demo-users.mjs sync --users <path> --realm-file <path> [--output <path>] [--base-url <url>] [--realm <realm>] [--admin-user <user>] [--admin-password <password>]`

function readJsonFile(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
}

function writeJsonFile(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toAttributeValues(value) {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (value == null) return []
  return [String(value)]
}

function normalizeAttributes(attributes = {}) {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      toAttributeValues(value),
    ]),
  )
}

function passwordCredential(user) {
  return (user.credentials ?? []).find(credential => {
    return credential?.type === 'password' && readNonEmpty(credential.value)
  })
}

export function normalizeDemoUser(user) {
  const credential = passwordCredential(user)
  const normalized = {
    attributes: {
      ...normalizeAttributes(user.attributes),
      [DEMO_USER_MARKER_ATTRIBUTE]: [DEMO_USER_MARKER_VALUE],
    },
    email: user.email,
    emailVerified: user.emailVerified === true,
    enabled: user.enabled !== false,
    firstName: user.firstName,
    lastName: user.lastName,
    realmRoles: [...(user.realmRoles ?? [])].filter(role =>
      MANAGED_REALM_ROLES.includes(role),
    ),
    username: user.username,
  }

  if (credential) {
    normalized.credentials = [
      {
        temporary: credential.temporary === true,
        type: 'password',
        value: credential.value,
      },
    ]
  }

  return normalized
}

export function buildDemoUsersDocument(devRealm, options = {}) {
  const users = (devRealm.users ?? []).map(normalizeDemoUser)
  return {
    generatedAt: readNonEmpty(options.generatedAt) ?? new Date().toISOString(),
    markerAttribute: DEMO_USER_MARKER_ATTRIBUTE,
    markerValue: DEMO_USER_MARKER_VALUE,
    schemaVersion: DEMO_USERS_SCHEMA_VERSION,
    sourceRealm: devRealm.realm,
    users,
  }
}

export function isDemoUser(user, document = {}) {
  const markerAttribute = document.markerAttribute ?? DEMO_USER_MARKER_ATTRIBUTE
  const markerValue = document.markerValue ?? DEMO_USER_MARKER_VALUE
  return toAttributeValues(user?.attributes?.[markerAttribute]).includes(
    markerValue,
  )
}

function findDuplicateUsernames(users) {
  const seen = new Set()
  const duplicates = new Set()
  for (const user of users) {
    const username = user?.username
    if (typeof username !== 'string') continue
    if (seen.has(username)) {
      duplicates.add(username)
    } else {
      seen.add(username)
    }
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right))
}

export function normalizeDemoUsersDocument(document) {
  if (document?.schemaVersion !== DEMO_USERS_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported demo users schema version: ${document?.schemaVersion}`,
    )
  }
  const users = document.users ?? []
  const duplicateUsernames = findDuplicateUsernames(users)
  if (duplicateUsernames.length > 0) {
    throw new Error(
      `Demo users document contains duplicate username(s): ${duplicateUsernames.join(', ')}`,
    )
  }
  return {
    ...document,
    users: users.map(normalizeDemoUser),
  }
}

export function mergeDemoUsersIntoRealm(realm, document) {
  const normalized = normalizeDemoUsersDocument(document)
  const demoUsernames = new Set(normalized.users.map(user => user.username))
  const preservedUsers = (realm.users ?? []).filter(user => {
    return !isDemoUser(user, normalized) && !demoUsernames.has(user.username)
  })

  return {
    ...realm,
    users: [...preservedUsers, ...normalized.users],
  }
}

function parseArgs(args) {
  const [command, ...rest] = args
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }
  return { command, options }
}

function requireOption(value, name) {
  const normalized = readNonEmpty(value)
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

function endpoint(baseUrl, suffix) {
  return `${String(baseUrl).replace(/\/+$/u, '')}${suffix}`
}

async function keycloakJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options)
  if (!response.ok) {
    const text =
      typeof response.text === 'function' ? await response.text() : ''
    throw new Error(
      `Keycloak request failed (${response.status}) for ${url}: ${text}`.trim(),
    )
  }
  if (response.status === 204) return null
  return response.json()
}

async function keycloakNoContent(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options)
  if (!response.ok) {
    const text =
      typeof response.text === 'function' ? await response.text() : ''
    throw new Error(
      `Keycloak request failed (${response.status}) for ${url}: ${text}`.trim(),
    )
  }
}

async function fetchAdminToken(options) {
  const body = new URLSearchParams({
    client_id: 'admin-cli',
    grant_type: 'password',
    password: options.adminPassword,
    username: options.adminUser,
  })
  const payload = await keycloakJson(
    options.fetchImpl,
    endpoint(options.baseUrl, '/realms/master/protocol/openid-connect/token'),
    {
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    },
  )
  const token = readNonEmpty(payload?.access_token)
  if (!token) {
    throw new Error(
      'Keycloak admin token response did not include access_token.',
    )
  }
  return token
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

async function listRealmUsers(options, token) {
  const users = []
  const max = 100
  for (let first = 0; ; first += max) {
    const chunk = await keycloakJson(
      options.fetchImpl,
      endpoint(
        options.baseUrl,
        `/admin/realms/${encodeURIComponent(options.realm)}/users?briefRepresentation=false&first=${first}&max=${max}`,
      ),
      { headers: authHeaders(token) },
    )
    users.push(...chunk)
    if (chunk.length < max) return users
  }
}

async function findRealmUser(options, token, username) {
  const users = await keycloakJson(
    options.fetchImpl,
    endpoint(
      options.baseUrl,
      `/admin/realms/${encodeURIComponent(options.realm)}/users?username=${encodeURIComponent(username)}&exact=true&briefRepresentation=false`,
    ),
    { headers: authHeaders(token) },
  )
  return users.find(user => user.username === username) ?? null
}

function keycloakUserPayload(user) {
  const {
    credentials: _credentials,
    realmRoles: _realmRoles,
    ...payload
  } = user
  return payload
}

async function upsertUser(options, token, user, existingUser) {
  if (!existingUser) {
    await keycloakNoContent(
      options.fetchImpl,
      endpoint(
        options.baseUrl,
        `/admin/realms/${encodeURIComponent(options.realm)}/users`,
      ),
      {
        body: JSON.stringify(keycloakUserPayload(user)),
        headers: authHeaders(token),
        method: 'POST',
      },
    )
    return findRealmUser(options, token, user.username)
  }

  await keycloakNoContent(
    options.fetchImpl,
    endpoint(
      options.baseUrl,
      `/admin/realms/${encodeURIComponent(options.realm)}/users/${existingUser.id}`,
    ),
    {
      body: JSON.stringify(keycloakUserPayload(user)),
      headers: authHeaders(token),
      method: 'PUT',
    },
  )
  return { ...existingUser, ...keycloakUserPayload(user) }
}

async function syncPassword(options, token, user, keycloakUser) {
  const credential = passwordCredential(user)
  if (!credential) return
  await keycloakNoContent(
    options.fetchImpl,
    endpoint(
      options.baseUrl,
      `/admin/realms/${encodeURIComponent(options.realm)}/users/${keycloakUser.id}/reset-password`,
    ),
    {
      body: JSON.stringify({
        temporary: credential.temporary === true,
        type: 'password',
        value: credential.value,
      }),
      headers: authHeaders(token),
      method: 'PUT',
    },
  )
}

async function fetchRealmRole(options, token, roleName) {
  return keycloakJson(
    options.fetchImpl,
    endpoint(
      options.baseUrl,
      `/admin/realms/${encodeURIComponent(options.realm)}/roles/${encodeURIComponent(roleName)}`,
    ),
    { headers: authHeaders(token) },
  )
}

async function syncRealmRoles(options, token, user, keycloakUser, roleCache) {
  const desiredNames = new Set(user.realmRoles ?? [])
  for (const roleName of desiredNames) {
    if (!roleCache.has(roleName)) {
      roleCache.set(roleName, await fetchRealmRole(options, token, roleName))
    }
  }

  const currentRoles = await keycloakJson(
    options.fetchImpl,
    endpoint(
      options.baseUrl,
      `/admin/realms/${encodeURIComponent(options.realm)}/users/${keycloakUser.id}/role-mappings/realm`,
    ),
    { headers: authHeaders(token) },
  )
  const currentManagedRoles = currentRoles.filter(role =>
    MANAGED_REALM_ROLES.includes(role.name),
  )
  const removeRoles = currentManagedRoles.filter(
    role => !desiredNames.has(role.name),
  )
  const currentNames = new Set(currentManagedRoles.map(role => role.name))
  const addRoles = [...desiredNames]
    .filter(roleName => !currentNames.has(roleName))
    .map(roleName => roleCache.get(roleName))

  if (removeRoles.length > 0) {
    await keycloakNoContent(
      options.fetchImpl,
      endpoint(
        options.baseUrl,
        `/admin/realms/${encodeURIComponent(options.realm)}/users/${keycloakUser.id}/role-mappings/realm`,
      ),
      {
        body: JSON.stringify(removeRoles),
        headers: authHeaders(token),
        method: 'DELETE',
      },
    )
  }
  if (addRoles.length > 0) {
    await keycloakNoContent(
      options.fetchImpl,
      endpoint(
        options.baseUrl,
        `/admin/realms/${encodeURIComponent(options.realm)}/users/${keycloakUser.id}/role-mappings/realm`,
      ),
      {
        body: JSON.stringify(addRoles),
        headers: authHeaders(token),
        method: 'POST',
      },
    )
  }
}

export async function syncLiveDemoUsers(options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('syncLiveDemoUsers requires fetch.')
  }
  const normalizedOptions = {
    adminPassword: requireOption(options.adminPassword, 'adminPassword'),
    adminUser: requireOption(options.adminUser, 'adminUser'),
    baseUrl: readNonEmpty(options.baseUrl) ?? DEFAULT_KEYCLOAK_BASE_URL,
    fetchImpl,
    realm: readNonEmpty(options.realm) ?? DEFAULT_KEYCLOAK_REALM,
  }
  const document = normalizeDemoUsersDocument(options.document)
  const token = await fetchAdminToken(normalizedOptions)
  const existingUsers = await listRealmUsers(normalizedOptions, token)
  const existingByUsername = new Map(
    existingUsers.map(user => [user.username, user]),
  )
  const desiredByUsername = new Map(
    document.users.map(user => [user.username, user]),
  )
  const summary = {
    adopted: 0,
    created: 0,
    deleted: 0,
    updated: 0,
  }

  for (const existingUser of existingUsers) {
    if (
      isDemoUser(existingUser, document) &&
      !desiredByUsername.has(existingUser.username)
    ) {
      await keycloakNoContent(
        normalizedOptions.fetchImpl,
        endpoint(
          normalizedOptions.baseUrl,
          `/admin/realms/${encodeURIComponent(normalizedOptions.realm)}/users/${existingUser.id}`,
        ),
        {
          headers: authHeaders(token),
          method: 'DELETE',
        },
      )
      summary.deleted += 1
    }
  }

  const roleCache = new Map()
  for (const user of document.users) {
    const existingUser = existingByUsername.get(user.username) ?? null
    if (existingUser && !isDemoUser(existingUser, document)) {
      summary.adopted += 1
    }
    const keycloakUser = await upsertUser(
      normalizedOptions,
      token,
      user,
      existingUser,
    )
    if (!keycloakUser?.id) {
      throw new Error(`Keycloak did not return user id for ${user.username}.`)
    }
    if (existingUser) summary.updated += 1
    else summary.created += 1
    await syncPassword(normalizedOptions, token, user, keycloakUser)
    await syncRealmRoles(
      normalizedOptions,
      token,
      user,
      keycloakUser,
      roleCache,
    )
  }

  return summary
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const fsImpl = dependencies.fsImpl ?? fs
  const env = dependencies.env ?? process.env
  try {
    const { command, options } = parseArgs(args)
    if (command === 'generate') {
      const devRealmPath = requireOption(
        options['dev-realm'] ?? DEFAULT_DEV_REALM_PATH,
        '--dev-realm',
      )
      const output = requireOption(
        options.output ?? DEFAULT_DEMO_USERS_PATH,
        '--output',
      )
      const devRealm = readJsonFile(devRealmPath, fsImpl)
      writeJsonFile(
        output,
        buildDemoUsersDocument(devRealm, {
          generatedAt: options['generated-at'],
        }),
        fsImpl,
      )
      consoleObj.log(`Wrote ${output}`)
      return 0
    }

    if (command === 'merge-file' || command === 'sync') {
      const usersPath = requireOption(options.users, '--users')
      const realmFile = requireOption(options['realm-file'], '--realm-file')
      const output = readNonEmpty(options.output) ?? realmFile
      const document = readJsonFile(usersPath, fsImpl)
      const realm = readJsonFile(realmFile, fsImpl)
      writeJsonFile(output, mergeDemoUsersIntoRealm(realm, document), fsImpl)
      consoleObj.log(`Merged demo users into ${output}`)
      if (command === 'merge-file') return 0
    }

    if (command === 'sync-live' || command === 'sync') {
      const usersPath = requireOption(options.users, '--users')
      const summary = await syncLiveDemoUsers({
        adminPassword: options['admin-password'] ?? env.KEYCLOAK_ADMIN_PASSWORD,
        adminUser: options['admin-user'] ?? env.KEYCLOAK_ADMIN,
        baseUrl: options['base-url'],
        document: readJsonFile(usersPath, fsImpl),
        fetchImpl: dependencies.fetchImpl,
        realm: options.realm,
      })
      consoleObj.log(
        `Synced demo users (created ${summary.created}, updated ${summary.updated}, adopted ${summary.adopted}, deleted ${summary.deleted}).`,
      )
      return 0
    }

    consoleObj.error(USAGE)
    return 1
  } catch (error) {
    consoleObj.error(error instanceof Error ? error.message : String(error))
    consoleObj.error(USAGE)
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2))
}
