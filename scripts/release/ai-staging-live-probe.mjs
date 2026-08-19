#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const FIXED_SYNTHETIC_NEED =
  'Synthetic staging verification. No personal or production data.'
const SAFE_PATH_VALUE = /^[A-Za-z0-9._:-]{1,160}$/u

function requiredEnv(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the staging-live probe.`)
  return value
}

function safePathValue(value, name) {
  if (!SAFE_PATH_VALUE.test(value)) throw new Error(`${name} is invalid.`)
  return value
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
  const areaId = Number(requiredEnv(env, 'AI_STAGING_LIVE_AREA_ID'))
  if (!Number.isSafeInteger(areaId) || areaId <= 0) {
    throw new Error('AI_STAGING_LIVE_AREA_ID must be a positive integer.')
  }

  return {
    areaId,
    baseUrl: baseUrl.toString(),
    cookie,
    intendedPath: {
      adapterType: safePathValue(
        requiredEnv(env, 'AI_STAGING_LIVE_ADAPTER_TYPE'),
        'AI_STAGING_LIVE_ADAPTER_TYPE',
      ),
      aiConnectionId: safePathValue(
        requiredEnv(env, 'AI_STAGING_LIVE_CONNECTION_ID'),
        'AI_STAGING_LIVE_CONNECTION_ID',
      ),
      aiConnectionModelRevisionId: safePathValue(
        requiredEnv(env, 'AI_STAGING_LIVE_MODEL_REVISION_ID'),
        'AI_STAGING_LIVE_MODEL_REVISION_ID',
      ),
      aiRunProfileRevisionId: safePathValue(
        requiredEnv(env, 'AI_STAGING_LIVE_PROFILE_REVISION_ID'),
        'AI_STAGING_LIVE_PROFILE_REVISION_ID',
      ),
    },
    profileKey: 'generation_without_images',
    status: 'configured',
  }
}

async function requestJson(fetchImpl, url, cookie) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', cookie },
    method: 'GET',
    redirect: 'error',
  })
  if (!response.ok) {
    throw new Error(
      `AI staging-live preflight failed with HTTP ${response.status}.`,
    )
  }
  return response.json()
}

function requireArray(value, context) {
  if (!Array.isArray(value))
    throw new Error(`${context} returned invalid JSON.`)
  return value
}

function preflightPath(configuration, profiles, revisions, connection) {
  const profile = requireArray(profiles, 'Run-profile preflight').find(
    candidate => candidate?.profileKey === configuration.profileKey,
  )
  if (
    profile?.operationalStatus !== 'enabled' ||
    profile.activeRevisionId !==
      configuration.intendedPath.aiRunProfileRevisionId ||
    !Array.isArray(profile.blockers) ||
    profile.blockers.length !== 0
  ) {
    throw new Error(
      'The active run profile does not match the intended staging path.',
    )
  }
  const revision = requireArray(
    revisions,
    'Run-profile revision preflight',
  ).find(
    candidate =>
      candidate?.id === configuration.intendedPath.aiRunProfileRevisionId,
  )
  if (
    revision?.status !== 'active' ||
    revision.modelRevisionId !==
      configuration.intendedPath.aiConnectionModelRevisionId
  ) {
    throw new Error(
      'The model revision does not match the intended staging path.',
    )
  }
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
  if (selectedModel?.status !== 'verified') {
    throw new Error('The intended staging model revision is not verified.')
  }
}

function terminalEvents(source) {
  return source
    .split(/\r?\n\r?\n/u)
    .filter(Boolean)
    .map(block => {
      const lines = block.split(/\r?\n/u)
      const event = lines.find(line => line.startsWith('event: '))?.slice(7)
      const data = lines.find(line => line.startsWith('data: '))?.slice(6)
      if (data) JSON.parse(data)
      return event
    })
    .filter(event => ['done', 'error', 'validation_error'].includes(event))
}

export async function runAiStagingLiveSyntheticProbe(
  configuration,
  { fetchImpl = fetch } = {},
) {
  const baseUrl = new URL(configuration.baseUrl)
  if (baseUrl.protocol !== 'https:') {
    throw new Error('The staging-live synthetic probe must use HTTPS.')
  }
  const profilePath = encodeURIComponent(configuration.profileKey)
  const [profiles, revisions, connection] = await Promise.all([
    requestJson(
      fetchImpl,
      new URL('/api/admin/ai-run-profiles', baseUrl),
      configuration.cookie,
    ),
    requestJson(
      fetchImpl,
      new URL(`/api/admin/ai-run-profiles/${profilePath}/revisions`, baseUrl),
      configuration.cookie,
    ),
    requestJson(
      fetchImpl,
      new URL(
        `/api/admin/ai-connections/${encodeURIComponent(configuration.intendedPath.aiConnectionId)}`,
        baseUrl,
      ),
      configuration.cookie,
    ),
  ])
  preflightPath(configuration, profiles, revisions, connection)

  const response = await fetchImpl(
    new URL('/api/ai/generate-requirement-import', baseUrl),
    {
      body: JSON.stringify({
        areaId: configuration.areaId,
        count: 1,
        locale: 'en',
        mode: 'library',
        need: FIXED_SYNTHETIC_NEED,
      }),
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        cookie: configuration.cookie,
        origin: baseUrl.origin,
        'x-requested-with': 'XMLHttpRequest',
      },
      method: 'POST',
      redirect: 'error',
    },
  )
  if (!response.ok) {
    throw new Error(
      `AI staging-live probe failed with HTTP ${response.status}.`,
    )
  }
  const events = terminalEvents(await response.text())
  if (events.length !== 1 || events[0] !== 'done') {
    throw new Error(
      'AI staging-live probe requires exactly one successful terminal event.',
    )
  }

  return {
    intendedPath: Object.freeze({ ...configuration.intendedPath }),
    syntheticProbe: Object.freeze({
      ...configuration.intendedPath,
      externalLiveCallMade: true,
      outcome: 'completed',
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
