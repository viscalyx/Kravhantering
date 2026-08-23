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
  node scripts/devcontainer/hsa-mock.mjs <config|build|up|recreate|status|verify|logs|restart|down> [docker compose args]`

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

function runVerify(profile, options) {
  assertSuccess(
    runCompose(
      profile,
      ['up', '--build', '-d', '--force-recreate', ...HSA_SERVICES],
      options,
    ),
    'docker compose recreate HSA lookup services',
  )

  const verifyScript = `
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

  if (action === 'verify') return runVerify(profile, options)

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
