import childProcess from 'node:child_process'
import os from 'node:os'

const SERVICE_NAME = 'hsa-directory-mock'
const ADAPTER_SERVICE_NAME = 'hsa-person-lookup-adapter'
const CERT_SERVICE_NAME = 'hsa-mtls-provisioner'
const KONG_SERVICE_NAME = 'kong'
const APP_SERVICE_NAME = 'app'
const HSA_SERVICES = [
  CERT_SERVICE_NAME,
  SERVICE_NAME,
  ADAPTER_SERVICE_NAME,
  KONG_SERVICE_NAME,
]
const PROFILES = [
  {
    composeFile: '.devcontainer/docker-compose.yml',
    name: 'default',
  },
  {
    composeFile: '.devcontainer/elevated/docker-compose.yml',
    name: 'elevated',
  },
]

const USAGE = `Usage:
  node scripts/devcontainer/hsa-mock.mjs <config|build|up|recreate|status|ensure|inspect|verify|renew-startup|rotate|rollback-verify|logs|restart|down> [trust-domain|docker compose args]`

function run(command, args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  return spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: options.encoding ?? 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: options.stdio ?? 'inherit',
  })
}

function runCompose(profile, args, options = {}) {
  return run('docker', ['compose', '-f', profile.composeFile, ...args], options)
}

export function parseComposeJson(output) {
  const text = String(output ?? '').trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .flatMap(line => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
  }
}

export function isRunning(row) {
  const state = String(row?.State ?? row?.state ?? '').toLowerCase()
  const status = String(row?.Status ?? row?.status ?? '').toLowerCase()
  return state === 'running' || status === 'up' || status.startsWith('up ')
}

function runningService(profile, serviceName) {
  const result = runCompose(profile, ['ps', '--format', 'json', serviceName], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return null
  return parseComposeJson(result.stdout).find(isRunning) ?? null
}

function workspaceHostRoot(profile) {
  const app = runningService(profile, APP_SERVICE_NAME)
  if (!app) return undefined

  const container = String(
    app.ID ?? app.Id ?? app.id ?? app.Name ?? app.name ?? '',
  )
  if (!container) return undefined

  const result = run(
    'docker',
    [
      'inspect',
      '--format',
      '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}',
      container,
    ],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
  if (result.status !== 0) return undefined

  const hostRoot = String(result.stdout ?? '').trim()
  return hostRoot || undefined
}

function composeRunOptions(profile) {
  const hostRoot = workspaceHostRoot(profile)
  return {
    env: {
      WORKSPACE_BUILD_ROOT: process.cwd(),
      ...(hostRoot ? { WORKSPACE_HOST_ROOT: hostRoot } : {}),
    },
  }
}

function detectProfile() {
  const hostname = os.hostname()
  const activeProfiles = PROFILES.flatMap(profile => {
    const app = runningService(profile, APP_SERVICE_NAME)
    return app ? [{ app, profile }] : []
  })

  const currentProfile = activeProfiles.find(({ app }) => {
    const id = String(app.ID ?? app.Id ?? app.id ?? '')
    const name = String(app.Name ?? app.name ?? '')
    return id.startsWith(hostname) || name === hostname
  })
  if (currentProfile) return currentProfile.profile
  if (activeProfiles[0]) return activeProfiles[0].profile

  const mockProfile = PROFILES.find(profile =>
    Boolean(runningService(profile, SERVICE_NAME)),
  )
  return mockProfile ?? PROFILES[0]
}

function assertSuccess(result, description) {
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${description} failed with ${result.status}`)
  }
}

function printProfile(profile) {
  console.log(
    `Using ${profile.name} devcontainer profile (${profile.composeFile})`,
  )
}

function ensureRunning(profile, serviceName, options) {
  if (runningService(profile, serviceName)) return
  assertSuccess(
    runCompose(profile, ['up', '--build', '-d', serviceName], options),
    `docker compose up ${serviceName}`,
  )
}

function runStatus(profile, options) {
  ensureRunning(profile, SERVICE_NAME, options)
  ensureRunning(profile, ADAPTER_SERVICE_NAME, options)
  assertSuccess(
    runCompose(profile, ['ps', SERVICE_NAME], options),
    'docker compose ps hsa-directory-mock',
  )
  assertSuccess(
    runCompose(profile, ['ps', ADAPTER_SERVICE_NAME], options),
    'docker compose ps hsa-person-lookup-adapter',
  )

  const statusScript = `
    const response = await fetch('http://127.0.0.1:8081/health')
    if (!response.ok) throw new Error(\`health returned \${response.status}\`)
    console.log(JSON.stringify(await response.json()))
  `

  console.log('Verifying HSA directory mock and adapter health...')
  assertSuccess(
    runCompose(
      profile,
      [
        'exec',
        '-T',
        SERVICE_NAME,
        'node',
        '--input-type=module',
        '-e',
        statusScript,
      ],
      options,
    ),
    'HSA directory mock health check',
  )
  assertSuccess(
    runCompose(
      profile,
      [
        'exec',
        '-T',
        ADAPTER_SERVICE_NAME,
        'node',
        '--input-type=module',
        '-e',
        statusScript,
      ],
      options,
    ),
    'HSA person lookup adapter health check',
  )
}

function runVerify(
  profile,
  options,
  { forceFailure = false, recreate = true } = {},
) {
  if (recreate) {
    assertSuccess(
      runCompose(
        profile,
        ['up', '--build', '-d', '--force-recreate', ...HSA_SERVICES],
        options,
      ),
      'docker compose recreate HSA lookup services',
    )
  }

  const verifyScript = `
    if (process.env.HSA_MTLS_FORCE_VERIFY_FAILURE === 'true') throw new Error('injected post-promotion verification failure')
    const fs = await import('node:fs')
    const https = await import('node:https')
    const crypto = await import('node:crypto')
    async function postRest() {
      const body = JSON.stringify({ hsaId: 'SE5560000001-marias' })
      return await new Promise((resolve, reject) => {
        const request = https.request({
          host: 'kong', port: 8443, path: '/hsa/person-records/lookup', method: 'POST', servername: 'kong',
          ca: fs.readFileSync('/run/kravhantering/hsa-mtls/kong-server-ca.crt'),
          cert: fs.readFileSync('/run/kravhantering/hsa-mtls/app-client.crt'),
          key: fs.readFileSync('/run/kravhantering/hsa-mtls/app-client.key'),
          minVersion: 'TLSv1.2', rejectUnauthorized: true,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Kravhantering-HSA-Correlation-ID': crypto.randomUUID() },
        }, response => {
          const chunks = []
          response.on('data', chunk => chunks.push(chunk))
          response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
        })
        request.on('error', reject)
        request.end(body)
      })
    }

    let lastError
    let verified = false
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        const result = await postRest()
        const restPerson = result.body
        if (result.status !== 200 || restPerson.hsaId !== 'SE5560000001-marias' || restPerson.givenName !== 'Maria' || restPerson.surname !== 'Svensson') throw new Error('bounded verification failure')
        console.log(
          \`REST HSA lookup OK: \${restPerson.hsaId} \${restPerson.givenName} \${restPerson.surname}\`,
        )
        verified = true
        break
      } catch (error) {
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    if (!verified) throw lastError
  `

  assertSuccess(
    runCompose(
      profile,
      [
        'exec',
        '-T',
        ...(forceFailure ? ['-e', 'HSA_MTLS_FORCE_VERIFY_FAILURE=true'] : []),
        APP_SERVICE_NAME,
        'node',
        '--input-type=module',
        '-e',
        verifyScript,
      ],
      options,
    ),
    'Kong HSA REST verification',
  )
  console.log('Kong HSA verification completed.')
}

function assertExternalLifecycleRunner(profile) {
  const app = runningService(profile, APP_SERVICE_NAME)
  const id = String(app?.ID ?? app?.Id ?? app?.id ?? '')
  if (id?.startsWith(os.hostname())) {
    throw new Error(
      'HSA certificate lifecycle changes must be launched from the host checkout because they recreate the devcontainer app service',
    )
  }
}

function provision(profile, options, ...args) {
  assertSuccess(
    runCompose(profile, ['run', '--rm', CERT_SERVICE_NAME, ...args], options),
    `HSA mTLS provisioner ${args[0]}`,
  )
}

function provisionResult(profile, options, ...args) {
  const result = runCompose(
    profile,
    ['run', '--rm', CERT_SERVICE_NAME, ...args],
    { ...options, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  assertSuccess(result, `HSA mTLS provisioner ${args[0]}`)
  const payload = JSON.parse(String(result.stdout))
  if (payload.ok !== true || !payload.result) {
    throw new Error(`HSA mTLS provisioner ${args[0]} returned invalid output`)
  }
  return payload.result
}

function inspectSelection(profile, options) {
  const result = runCompose(
    profile,
    ['run', '--rm', CERT_SERVICE_NAME, 'inspect'],
    { ...options, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  assertSuccess(result, 'HSA mTLS provisioner inspect')
  const payload = JSON.parse(String(result.stdout))
  if (payload.ok !== true || !payload.result) {
    throw new Error('HSA mTLS provisioner inspect returned invalid output')
  }
  return payload.result.selection
}

function finalizationIsPending(selection, expectedGenerationId, cause) {
  if (selection.current !== expectedGenerationId) {
    throw new Error(
      'HSA mTLS selection changed while reconciling finalization',
      { cause },
    )
  }
  if (selection.previous === null) return false
  if (typeof selection.previous === 'string' && selection.previous.length > 0) {
    return true
  }
  throw new Error('HSA mTLS provisioner inspect returned invalid selection')
}

function finalizeAuthenticatedPromotion(
  profile,
  options,
  expectedGenerationId,
) {
  if (
    typeof expectedGenerationId !== 'string' ||
    expectedGenerationId.length === 0
  ) {
    throw new Error(
      'Expected the authenticated HSA mTLS generation for finalization',
    )
  }
  let finalizeError = null
  try {
    provision(profile, options, 'finalize', expectedGenerationId)
  } catch (error) {
    finalizeError = error
  }

  let selection = null
  try {
    selection = inspectSelection(profile, options)
  } catch (inspectionError) {
    finalizeError ??= inspectionError
  }
  if (
    selection &&
    !finalizationIsPending(selection, expectedGenerationId, finalizeError)
  ) {
    if (finalizeError) {
      console.warn(
        'HSA mTLS finalization reported failure after the promotion was reconciled.',
      )
    }
    return
  }

  let retryError = null
  try {
    provision(profile, options, 'finalize', expectedGenerationId)
  } catch (error) {
    retryError = error
  }
  selection = inspectSelection(profile, options)
  if (!finalizationIsPending(selection, expectedGenerationId, retryError)) {
    if (retryError) {
      console.warn(
        'HSA mTLS finalization retry reported failure after the promotion was reconciled.',
      )
    }
    return
  }
  throw new Error(
    'HSA mTLS promotion remains pending after finalization retry',
    { cause: retryError ?? finalizeError ?? undefined },
  )
}

function stopEndpoints(profile, options) {
  for (const service of [
    APP_SERVICE_NAME,
    KONG_SERVICE_NAME,
    ADAPTER_SERVICE_NAME,
    SERVICE_NAME,
  ]) {
    assertSuccess(
      runCompose(profile, ['stop', service], options),
      `docker compose stop ${service}`,
    )
  }
}

function startEndpoints(profile, options, { recreate = false } = {}) {
  for (const service of [
    SERVICE_NAME,
    ADAPTER_SERVICE_NAME,
    KONG_SERVICE_NAME,
    APP_SERVICE_NAME,
  ]) {
    assertSuccess(
      runCompose(
        profile,
        [
          'up',
          '-d',
          '--wait',
          ...(recreate ? ['--force-recreate'] : []),
          service,
        ],
        options,
      ),
      `docker compose start ${service}`,
    )
  }
}

function stopTransportEndpoints(profile, options) {
  for (const service of [
    KONG_SERVICE_NAME,
    ADAPTER_SERVICE_NAME,
    SERVICE_NAME,
  ]) {
    assertSuccess(
      runCompose(profile, ['stop', service], options),
      `docker compose stop ${service}`,
    )
  }
}

function runStartupRenewal(profile, options) {
  const selection = inspectSelection(profile, options)
  if (!selection.previous) {
    console.log('HSA mTLS startup renewal: current generation reused.')
    return
  }

  try {
    runVerify(profile, options, { recreate: false })
  } catch (promotionError) {
    stopTransportEndpoints(profile, options)
    provision(profile, options, 'rollback')
    provision(profile, options, 'deploy')
    startEndpoints(profile, options, { recreate: true })
    runVerify(profile, options, { recreate: false })
    console.warn(
      `HSA mTLS startup renewal failed and the prior generation was restored: ${promotionError.message}`,
    )
    return
  }
  finalizeAuthenticatedPromotion(profile, options, selection.current)
  console.log('HSA mTLS startup renewal authenticated and finalized.')
}

function runEnsure(profile, options) {
  assertExternalLifecycleRunner(profile)
  stopEndpoints(profile, options)

  let ensured
  try {
    ensured = provisionResult(profile, options, 'ensure')
  } catch (error) {
    startEndpoints(profile, options)
    throw error
  }

  if (ensured.action === 'reused') {
    startEndpoints(profile, options)
    runVerify(profile, options, { recreate: false })
    return
  }
  if (ensured.action !== 'promoted') {
    startEndpoints(profile, options)
    throw new Error('HSA mTLS provisioner ensure returned an unknown action')
  }

  try {
    provision(profile, options, 'deploy')
    startEndpoints(profile, options, { recreate: true })
    runVerify(profile, options, { recreate: false })
  } catch (promotionError) {
    stopEndpoints(profile, options)
    if (!ensured.previousGenerationId) {
      try {
        provision(profile, options, 'deploy')
        startEndpoints(profile, options, { recreate: true })
      } catch {
        // The original promotion failure remains the actionable lifecycle error.
      }
      throw promotionError
    }
    provision(profile, options, 'rollback')
    provision(profile, options, 'deploy')
    startEndpoints(profile, options, { recreate: true })
    runVerify(profile, options, { recreate: false })
    throw promotionError
  }
  finalizeAuthenticatedPromotion(profile, options, ensured.generationId)
}

function requireTrustDomain(value) {
  if (!['app-to-kong', 'kong-to-adapter', 'adapter-to-hsa'].includes(value)) {
    throw new Error('Expected one HSA mTLS trust domain')
  }
  return value
}

function runRotation(profile, options, trustDomain) {
  stopEndpoints(profile, options)
  const rotated = provisionResult(
    profile,
    options,
    'rotate',
    requireTrustDomain(trustDomain),
  )
  provision(profile, options, 'deploy')
  startEndpoints(profile, options)
  try {
    runVerify(profile, options, { recreate: false })
  } catch (error) {
    stopEndpoints(profile, options)
    provision(profile, options, 'rollback')
    provision(profile, options, 'deploy')
    startEndpoints(profile, options)
    runVerify(profile, options, { recreate: false })
    throw error
  }
  finalizeAuthenticatedPromotion(profile, options, rotated.generationId)
}

function runRollbackVerification(profile, options, trustDomain) {
  stopEndpoints(profile, options)
  provision(profile, options, 'rotate', requireTrustDomain(trustDomain))
  provision(profile, options, 'deploy')
  startEndpoints(profile, options)
  let injectedFailureObserved = false
  try {
    runVerify(profile, options, { forceFailure: true, recreate: false })
  } catch {
    injectedFailureObserved = true
  }
  if (!injectedFailureObserved) {
    throw new Error('Injected post-promotion verification unexpectedly passed')
  }
  stopEndpoints(profile, options)
  provision(profile, options, 'rollback')
  provision(profile, options, 'deploy')
  startEndpoints(profile, options)
  runVerify(profile, options, { recreate: false })
}

function runAction(action, extraArgs, profile) {
  printProfile(profile)
  const options = composeRunOptions(profile)

  if (action === 'config') {
    return assertSuccess(
      runCompose(profile, ['config', ...HSA_SERVICES], options),
      'docker compose config HSA lookup services',
    )
  }

  if (action === 'build') {
    return assertSuccess(
      runCompose(
        profile,
        ['build', SERVICE_NAME, ADAPTER_SERVICE_NAME],
        options,
      ),
      'docker compose build HSA lookup services',
    )
  }

  if (action === 'renew-startup') {
    return runStartupRenewal(profile, options)
  }

  if (action === 'up') {
    return assertSuccess(
      runCompose(profile, ['up', '--build', '-d', ...HSA_SERVICES], options),
      'docker compose up HSA lookup services',
    )
  }

  if (action === 'recreate') {
    return assertSuccess(
      runCompose(
        profile,
        ['up', '--build', '-d', '--force-recreate', ...HSA_SERVICES],
        options,
      ),
      'docker compose recreate HSA lookup services',
    )
  }

  if (action === 'status') return runStatus(profile, options)

  if (action === 'ensure') {
    return runEnsure(profile, options)
  }

  if (action === 'inspect') return provision(profile, options, 'inspect')

  if (action === 'verify') return runVerify(profile, options)

  if (action === 'rotate') {
    assertExternalLifecycleRunner(profile)
    return runRotation(profile, options, extraArgs[0])
  }

  if (action === 'rollback-verify') {
    assertExternalLifecycleRunner(profile)
    return runRollbackVerification(profile, options, extraArgs[0])
  }

  if (action === 'logs') {
    return assertSuccess(
      runCompose(
        profile,
        [
          'logs',
          '--tail=120',
          ...extraArgs,
          SERVICE_NAME,
          ADAPTER_SERVICE_NAME,
        ],
        options,
      ),
      'docker compose logs HSA lookup services',
    )
  }

  if (action === 'restart') {
    return assertSuccess(
      runCompose(
        profile,
        ['restart', SERVICE_NAME, ADAPTER_SERVICE_NAME, KONG_SERVICE_NAME],
        options,
      ),
      'docker compose restart HSA lookup services',
    )
  }

  if (action === 'down') {
    return assertSuccess(
      runCompose(
        profile,
        ['rm', '--stop', '--force', ...HSA_SERVICES],
        options,
      ),
      'docker compose rm HSA lookup services',
    )
  }

  throw new Error(`Unsupported action: ${action}`)
}

export async function main(args) {
  const [action, ...extraArgs] = args
  if (!action) {
    console.error(USAGE)
    return 1
  }

  try {
    runAction(action, extraArgs, detectProfile())
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(USAGE)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2))
}
