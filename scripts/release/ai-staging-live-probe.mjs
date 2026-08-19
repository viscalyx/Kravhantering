#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ADMIN_FUNCTIONAL_PROBE_VERSION = 'ai-admin-functional-probe-v3'
const MAX_RESPONSE_BYTES = 1_048_576
const REQUEST_TIMEOUT_MS = 120_000
const SAFE_PATH_VALUE = /^[A-Za-z0-9._:-]{1,160}$/u
const MAX_INTENDED_PROFILES = 100

function requiredEnv(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the staging-live probe.`)
  return value
}

function safePathValue(value, name) {
  if (!SAFE_PATH_VALUE.test(value)) throw new Error(`${name} is invalid.`)
  return value
}

function intendedProfileRevisionIds(env, representativeId) {
  const values = requiredEnv(env, 'AI_STAGING_LIVE_PROFILE_REVISION_IDS')
    .split(',')
    .map(value =>
      safePathValue(value.trim(), 'AI_STAGING_LIVE_PROFILE_REVISION_IDS'),
    )
  if (values.length > MAX_INTENDED_PROFILES) {
    throw new Error(
      `AI_STAGING_LIVE_PROFILE_REVISION_IDS supports at most ${MAX_INTENDED_PROFILES} values.`,
    )
  }
  if (new Set(values).size !== values.length) {
    throw new Error(
      'AI_STAGING_LIVE_PROFILE_REVISION_IDS must contain unique values.',
    )
  }
  if (!values.includes(representativeId)) {
    throw new Error(
      'AI_STAGING_LIVE_PROFILE_REVISION_IDS must include AI_STAGING_LIVE_PROFILE_REVISION_ID.',
    )
  }
  return values
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

  const cookieFile = requiredEnv(env, 'AI_STAGING_LIVE_SESSION_COOKIE_FILE')
  const stat = fsImpl.statSync(cookieFile)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error(
      'AI staging-live session cookie file must be a private regular file.',
    )
  }
  const cookie = fsImpl.readFileSync(cookieFile, 'utf8').trim()
  if (!cookie || /[\r\n]/u.test(cookie) || cookie.length > 8_192) {
    throw new Error('AI staging-live session cookie file is invalid.')
  }

  const representativeProfileRevisionId = safePathValue(
    requiredEnv(env, 'AI_STAGING_LIVE_PROFILE_REVISION_ID'),
    'AI_STAGING_LIVE_PROFILE_REVISION_ID',
  )
  const adapterType = safePathValue(
    requiredEnv(env, 'AI_STAGING_LIVE_ADAPTER_TYPE'),
    'AI_STAGING_LIVE_ADAPTER_TYPE',
  )
  if (adapterType === 'controlled_test') {
    throw new Error(
      'AI_STAGING_LIVE_ADAPTER_TYPE must identify an external live adapter.',
    )
  }
  return {
    baseUrl: baseUrl.toString(),
    cookie,
    expectedEnvironmentId: safePathValue(
      requiredEnv(env, 'AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID'),
      'AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID',
    ),
    intendedPath: {
      adapterType,
      aiConnectionId: safePathValue(
        requiredEnv(env, 'AI_STAGING_LIVE_CONNECTION_ID'),
        'AI_STAGING_LIVE_CONNECTION_ID',
      ),
      aiConnectionModelRevisionId: safePathValue(
        requiredEnv(env, 'AI_STAGING_LIVE_MODEL_REVISION_ID'),
        'AI_STAGING_LIVE_MODEL_REVISION_ID',
      ),
      aiRunProfileRevisionId: representativeProfileRevisionId,
    },
    intendedProfileRevisionIds: intendedProfileRevisionIds(
      env,
      representativeProfileRevisionId,
    ),
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

function preflightProfiles(configuration, profiles) {
  const byRevision = new Map()
  for (const profile of requireArray(profiles, 'Run-profile preflight')) {
    if (typeof profile?.activeRevisionId === 'string') {
      byRevision.set(profile.activeRevisionId, profile)
    }
  }
  for (const revisionId of configuration.intendedProfileRevisionIds) {
    const profile = byRevision.get(revisionId)
    if (
      profile?.operationalStatus !== 'enabled' ||
      !Array.isArray(profile.blockers) ||
      profile.blockers.length !== 0
    ) {
      throw new Error(
        'Every intended profile revision must be active, enabled, and unblocked.',
      )
    }
  }
}

function preflightConnection(configuration, connection) {
  if (
    connection?.lifecycleStatus !== 'active' ||
    connection.adapterKey !== configuration.intendedPath.adapterType
  ) {
    throw new Error('The adapter does not match the intended staging path.')
  }
  const selectedModel = requireArray(
    connection.models,
    'AI connection model preflight',
  )
    .flatMap(model => (Array.isArray(model?.revisions) ? model.revisions : []))
    .find(
      model =>
        model?.id === configuration.intendedPath.aiConnectionModelRevisionId,
    )
  if (
    selectedModel?.status !== 'verified' ||
    typeof selectedModel.revisionToken !== 'string' ||
    !selectedModel.revisionToken
  ) {
    throw new Error('The intended staging model revision is not verified.')
  }
  return selectedModel
}

function assertLivePathProbeResult(value, configuration) {
  const fields = [
    'adapterType',
    'adapterVersion',
    'aiConnectionId',
    'aiConnectionModelRevisionId',
    'aiRunProfileRevisionId',
    'connectionRevisionToken',
    'executionId',
    'externalLiveCallMade',
    'failureCategory',
    'modelRevisionToken',
    'outcome',
    'profileRevisionToken',
    'testSuiteVersion',
  ]
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\u0000') !== fields.sort().join('\u0000')
  ) {
    throw new Error('The fixed Admin functional probe v3 did not pass.')
  }
  const pathMatches =
    value.adapterType === configuration.intendedPath.adapterType &&
    value.aiConnectionId === configuration.intendedPath.aiConnectionId &&
    value.aiConnectionModelRevisionId ===
      configuration.intendedPath.aiConnectionModelRevisionId &&
    value.aiRunProfileRevisionId ===
      configuration.intendedPath.aiRunProfileRevisionId
  const safeProofValues = [
    value.adapterVersion,
    value.connectionRevisionToken,
    value.executionId,
    value.modelRevisionToken,
    value.profileRevisionToken,
  ].every(
    candidate =>
      typeof candidate === 'string' && SAFE_PATH_VALUE.test(candidate),
  )
  if (
    !pathMatches ||
    !safeProofValues ||
    value.adapterType === 'controlled_test' ||
    value.externalLiveCallMade !== true ||
    value.failureCategory !== null ||
    value.outcome !== 'passed' ||
    value.testSuiteVersion !== ADMIN_FUNCTIONAL_PROBE_VERSION
  ) {
    throw new Error('The fixed Admin functional probe v3 did not pass.')
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
  const profilesResponse = await requestJson(
    fetchImpl,
    new URL('/api/admin/ai-run-profiles', baseUrl),
    configuration.cookie,
    { method: 'GET' },
  )
  assertServerEnvironment(configuration, profilesResponse.headers)
  preflightProfiles(configuration, profilesResponse.body)

  const connectionUrl = new URL(
    `/api/admin/ai-connections/${encodeURIComponent(configuration.intendedPath.aiConnectionId)}`,
    baseUrl,
  )
  const connection = (
    await requestJson(fetchImpl, connectionUrl, configuration.cookie, {
      method: 'GET',
    })
  ).body
  preflightConnection(configuration, connection)

  const actionsUrl = new URL(`${connectionUrl.pathname}/actions`, baseUrl)
  const mutationHeaders = {
    'content-type': 'application/json',
    origin: baseUrl.origin,
    'x-requested-with': 'XMLHttpRequest',
  }
  const liveProof = assertLivePathProbeResult(
    await requestJson(fetchImpl, actionsUrl, configuration.cookie, {
      body: JSON.stringify({
        action: 'verify_live_path',
        modelRevisionId: configuration.intendedPath.aiConnectionModelRevisionId,
        profileRevisionId: configuration.intendedPath.aiRunProfileRevisionId,
      }),
      headers: mutationHeaders,
      method: 'POST',
    }).then(response => response.body),
    configuration,
  )

  return {
    adminFunctionalProbeVersion: liveProof.testSuiteVersion,
    intendedPath: Object.freeze({ ...configuration.intendedPath }),
    liveExecutionProof: Object.freeze({ ...liveProof }),
    preflightedProfileRevisionIds: Object.freeze([
      ...configuration.intendedProfileRevisionIds,
    ]),
    syntheticProbe: Object.freeze({
      ...configuration.intendedPath,
      externalLiveCallMade: liveProof.externalLiveCallMade,
      outcome: liveProof.outcome === 'passed' ? 'completed' : 'failed',
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
