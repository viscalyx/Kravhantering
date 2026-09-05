#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ADMIN_FUNCTIONAL_PROBE_VERSION = 'ai-admin-functional-probe-v2'
const MAX_RESPONSE_BYTES = 1_048_576
const REQUEST_TIMEOUT_MS = 120_000
const SAFE_PATH_VALUE = /^[A-Za-z0-9._:-]{1,160}$/u
const MAX_INTENDED_PROFILES = 3
const PROFILE_KEYS = Object.freeze([
  'generation_without_images',
  'generation_with_images',
  'invalid_json_repair',
])
const CONFIGURED_PATH_FIELDS = Object.freeze([
  'adapterType',
  'aiConnectionId',
  'aiConnectionModelRevisionId',
  'aiRunProfileConfigurationVersion',
  'aiRunProfileId',
  'profileKey',
])

function requiredEnv(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the staging-live probe.`)
  return value
}

function safePathValue(value, name) {
  if (!SAFE_PATH_VALUE.test(value)) throw new Error(`${name} is invalid.`)
  return value
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} is invalid.`)
  }
  return value
}

function privateFile(fsImpl, path, context, maximumBytes) {
  const stat = fsImpl.statSync(path)
  if (
    !stat.isFile() ||
    (stat.mode & 0o077) !== 0 ||
    (typeof stat.size === 'number' && stat.size > maximumBytes)
  ) {
    throw new Error(
      `${context} must be a private regular file within its size limit.`,
    )
  }
  return fsImpl.readFileSync(path, 'utf8')
}

function configuredPathsFile(env, fsImpl) {
  const file = requiredEnv(env, 'AI_STAGING_LIVE_PATHS_FILE')
  const source = privateFile(fsImpl, file, 'AI staging-live paths file', 16_384)
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error('AI staging-live paths file must contain valid JSON.')
  }
  if (!Array.isArray(parsed) || parsed.length !== MAX_INTENDED_PROFILES) {
    throw new Error('AI staging-live paths file must contain exactly 3 paths.')
  }
  const paths = parsed.map((path, index) => {
    if (
      typeof path !== 'object' ||
      path === null ||
      Array.isArray(path) ||
      Object.keys(path).sort().join('\u0000') !==
        [...CONFIGURED_PATH_FIELDS].sort().join('\u0000')
    ) {
      throw new Error(`AI staging-live path ${index + 1} is invalid.`)
    }
    const profileKey = safePathValue(path.profileKey, 'profileKey')
    if (!PROFILE_KEYS.includes(profileKey)) {
      throw new Error(`AI staging-live path ${index + 1} is invalid.`)
    }
    const adapterType = safePathValue(path.adapterType, 'adapterType')
    if (adapterType === 'controlled_test') {
      throw new Error('Every staging-live path must use an external adapter.')
    }
    return Object.freeze({
      adapterType,
      aiConnectionId: safePathValue(path.aiConnectionId, 'aiConnectionId'),
      aiConnectionModelRevisionId: safePathValue(
        path.aiConnectionModelRevisionId,
        'aiConnectionModelRevisionId',
      ),
      aiRunProfileConfigurationVersion: positiveInteger(
        path.aiRunProfileConfigurationVersion,
        'aiRunProfileConfigurationVersion',
      ),
      aiRunProfileId: safePathValue(path.aiRunProfileId, 'aiRunProfileId'),
      profileKey,
    })
  })
  if (
    new Set(paths.map(path => path.profileKey)).size !== PROFILE_KEYS.length ||
    new Set(paths.map(path => path.aiRunProfileId)).size !== paths.length
  ) {
    throw new Error(
      'AI staging-live paths must bind each fixed profile exactly once.',
    )
  }
  return Object.freeze(paths)
}

export function stagingLiveProbeConfiguration(env = process.env, fsImpl = fs) {
  if (env.AI_STAGING_LIVE_SYNTHETIC_PROBE !== '1') {
    return { status: 'skipped' }
  }
  const baseUrl = new URL(requiredEnv(env, 'AI_STAGING_LIVE_BASE_URL'))
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password) {
    throw new Error('AI_STAGING_LIVE_BASE_URL must use HTTPS without userinfo.')
  }
  baseUrl.pathname = '/'
  baseUrl.search = ''
  baseUrl.hash = ''

  const cookie = privateFile(
    fsImpl,
    requiredEnv(env, 'AI_STAGING_LIVE_SESSION_COOKIE_FILE'),
    'AI staging-live session cookie file',
    8_192,
  ).trim()
  if (!cookie || /[\r\n]/u.test(cookie) || cookie.length > 8_192) {
    throw new Error('AI staging-live session cookie file is invalid.')
  }

  return {
    baseUrl: baseUrl.toString(),
    cookie,
    expectedEnvironmentId: safePathValue(
      requiredEnv(env, 'AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID'),
      'AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID',
    ),
    intendedPaths: configuredPathsFile(env, fsImpl),
    status: 'configured',
  }
}

async function boundedResponseText(response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('AI staging-live probe exceeded its bounded response size.')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error(
          'AI staging-live probe exceeded its bounded response size.',
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

async function requestJson(fetchImpl, url, cookie, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: 'application/json',
      cookie,
      ...init.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(
      `AI staging-live request failed with HTTP ${response.status}.`,
    )
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new Error('AI staging-live request returned a non-JSON response.')
  }
  let parsed
  try {
    parsed = JSON.parse(await boundedResponseText(response))
  } catch (error) {
    if (error instanceof Error && error.message.includes('bounded response')) {
      throw error
    }
    throw new Error('AI staging-live request returned invalid JSON.')
  }
  return { body: parsed, headers: response.headers }
}

function requireArray(value, context) {
  if (!Array.isArray(value))
    throw new Error(`${context} returned invalid JSON.`)
  return value
}

function assertServerEnvironment(configuration, headers) {
  if (
    headers.get('x-kravhantering-deployment-environment') !== 'staging' ||
    headers.get('x-kravhantering-deployment-environment-id') !==
      configuration.expectedEnvironmentId
  ) {
    throw new Error(
      'AI staging-live probe requires the exact server-proven staging environment.',
    )
  }
  if (headers.get('x-kravhantering-ai-guard-active') !== 'true') {
    throw new Error(
      'AI staging-live probe requires the server-proven global AI guard to remain active.',
    )
  }
}

function preflightProfiles(paths, profiles) {
  const byId = new Map()
  for (const profile of requireArray(profiles, 'Run-profile preflight')) {
    if (typeof profile?.id === 'string') {
      byId.set(profile.id, profile)
    }
  }
  for (const path of paths) {
    const profile = byId.get(path.aiRunProfileId)
    if (
      profile?.operationalStatus !== 'enabled' ||
      profile.configurationStatus !== 'configured' ||
      profile.configurationVersion !== path.aiRunProfileConfigurationVersion ||
      !Array.isArray(profile.blockers) ||
      profile.blockers.length !== 0 ||
      profile.profileKey !== path.profileKey
    ) {
      throw new Error(
        'Every intended profile must be configured, enabled, and unblocked.',
      )
    }
  }
}

function preflightConnection(path, connection) {
  if (
    connection?.lifecycleStatus !== 'active' ||
    connection.adapterKey !== path.adapterType
  ) {
    throw new Error('The adapter does not match the intended staging path.')
  }
  const selectedModel = requireArray(
    connection.models,
    'AI connection model preflight',
  )
    .flatMap(model => (Array.isArray(model?.revisions) ? model.revisions : []))
    .find(model => model?.id === path.aiConnectionModelRevisionId)
  if (
    selectedModel?.status !== 'verified' ||
    typeof selectedModel.revisionToken !== 'string' ||
    !selectedModel.revisionToken
  ) {
    throw new Error('The intended staging model revision is not verified.')
  }
  return selectedModel
}

function assertLivePathProbeResult(value, path) {
  const fields = [
    'adapterType',
    'adapterVersion',
    'aiConnectionId',
    'aiConnectionModelRevisionId',
    'aiRunProfileConfigurationVersion',
    'aiRunProfileId',
    'connectionRevisionToken',
    'executionId',
    'externalLiveCallMade',
    'failureCategory',
    'modelRevisionToken',
    'outcome',
    'profileToken',
    'testSuiteVersion',
  ]
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\u0000') !== fields.sort().join('\u0000')
  ) {
    throw new Error(
      `The fixed Admin functional probe ${ADMIN_FUNCTIONAL_PROBE_VERSION} did not pass.`,
    )
  }
  const pathMatches =
    value.adapterType === path.adapterType &&
    value.aiConnectionId === path.aiConnectionId &&
    value.aiConnectionModelRevisionId === path.aiConnectionModelRevisionId &&
    value.aiRunProfileId === path.aiRunProfileId &&
    value.aiRunProfileConfigurationVersion ===
      path.aiRunProfileConfigurationVersion
  const safeProofValues = [
    value.adapterVersion,
    value.connectionRevisionToken,
    value.executionId,
    value.modelRevisionToken,
    value.profileToken,
  ].every(
    candidate =>
      typeof candidate === 'string' && SAFE_PATH_VALUE.test(candidate),
  )
  if (
    !pathMatches ||
    !Number.isInteger(value.aiRunProfileConfigurationVersion) ||
    value.aiRunProfileConfigurationVersion < 1 ||
    !safeProofValues ||
    value.adapterType === 'controlled_test' ||
    value.externalLiveCallMade !== true ||
    value.failureCategory !== null ||
    value.outcome !== 'passed' ||
    value.testSuiteVersion !== ADMIN_FUNCTIONAL_PROBE_VERSION
  ) {
    throw new Error(
      `The fixed Admin functional probe ${ADMIN_FUNCTIONAL_PROBE_VERSION} did not pass.`,
    )
  }
  return value
}

export async function runAiStagingLiveSyntheticProbe(
  configuration,
  { fetchImpl = fetch } = {},
) {
  const baseUrl = new URL(configuration.baseUrl)
  if (baseUrl.protocol !== 'https:') {
    throw new Error('The staging-live synthetic probe must use HTTPS.')
  }
  const intendedPaths = configuration.intendedPaths
  const profilesResponse = await requestJson(
    fetchImpl,
    new URL('/api/admin/ai-run-profiles', baseUrl),
    configuration.cookie,
    { method: 'GET' },
  )
  assertServerEnvironment(configuration, profilesResponse.headers)
  preflightProfiles(intendedPaths, profilesResponse.body)

  const mutationHeaders = {
    'content-type': 'application/json',
    origin: baseUrl.origin,
    'x-requested-with': 'XMLHttpRequest',
  }
  const liveExecutionProof = []
  for (const path of intendedPaths) {
    const connectionUrl = new URL(
      `/api/admin/ai-connections/${encodeURIComponent(path.aiConnectionId)}`,
      baseUrl,
    )
    const connection = (
      await requestJson(fetchImpl, connectionUrl, configuration.cookie, {
        method: 'GET',
      })
    ).body
    preflightConnection(path, connection)
    const actionsUrl = new URL(`${connectionUrl.pathname}/actions`, baseUrl)
    liveExecutionProof.push(
      assertLivePathProbeResult(
        await requestJson(fetchImpl, actionsUrl, configuration.cookie, {
          body: JSON.stringify({
            action: 'verify_live_path',
            expectedEnvironmentId: configuration.expectedEnvironmentId,
            modelRevisionId: path.aiConnectionModelRevisionId,
            profileKey: path.profileKey,
          }),
          headers: mutationHeaders,
          method: 'POST',
        }).then(response => response.body),
        path,
      ),
    )
  }
  const representativeProof = liveExecutionProof[0]
  if (!representativeProof) {
    throw new Error('The representative live execution proof is missing.')
  }

  const verifiedPaths = liveExecutionProof.map(proof =>
    Object.freeze({
      adapterType: proof.adapterType,
      adapterVersion: proof.adapterVersion,
      aiConnectionId: proof.aiConnectionId,
      aiConnectionModelRevisionId: proof.aiConnectionModelRevisionId,
      aiRunProfileConfigurationVersion: proof.aiRunProfileConfigurationVersion,
      aiRunProfileId: proof.aiRunProfileId,
      connectionRevisionToken: proof.connectionRevisionToken,
      modelRevisionToken: proof.modelRevisionToken,
      profileToken: proof.profileToken,
    }),
  )
  return {
    inventory: Object.freeze({
      intendedPaths: Object.freeze([...verifiedPaths]),
      verifiedPaths: Object.freeze([...verifiedPaths]),
    }),
    liveExecutionProof: Object.freeze(
      liveExecutionProof.map(proof => Object.freeze({ ...proof })),
    ),
    syntheticProbe: Object.freeze({
      ...verifiedPaths.find(
        path => path.aiRunProfileId === representativeProof.aiRunProfileId,
      ),
      externalLiveCallMade: representativeProof.externalLiveCallMade,
      outcome:
        representativeProof.outcome === 'passed' ? 'completed' : 'failed',
      payloadClassification: 'synthetic',
    }),
  }
}

export async function main({ env = process.env, fsImpl = fs } = {}) {
  const configuration = stagingLiveProbeConfiguration(env, fsImpl)
  if (configuration.status === 'skipped') {
    process.stdout.write(
      '{"status":"skipped","reason":"explicit_opt_in_missing"}\n',
    )
    return 0
  }
  const result = await runAiStagingLiveSyntheticProbe(configuration)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

/* v8 ignore start -- process-only CLI entrypoint */
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  main().catch(error => {
    process.stderr.write(
      `ai-staging-live-probe: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
/* v8 ignore stop */
