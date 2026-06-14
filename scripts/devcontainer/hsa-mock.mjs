import childProcess from 'node:child_process'
import os from 'node:os'

const SERVICE_NAME = 'hsa-directory-mock'
const ADAPTER_SERVICE_NAME = 'hsa-person-lookup-adapter'
const CERT_SERVICE_NAME = 'hsa-mtls-cert-generator'
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
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    const checks = [
      ['HSA directory mock', 'https://127.0.0.1:8443/health'],
      ['HSA person lookup adapter', 'http://hsa-person-lookup-adapter:8080/health'],
    ]
    for (const [name, url] of checks) {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(\`\${name} returned \${response.status}\`)
      }
      const body = await response.json()
      console.log(JSON.stringify({ name, ...body }, null, 2))
    }
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
    async function postRest() {
      const response = await fetch('http://kong:8000/hsa/person-records/lookup', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hsaId: 'SE5560000001-marias' })
      })
      const body = await response.json()
      if (!response.ok || body.hsaId !== 'SE5560000001-marias' || body.givenName !== 'Maria' || body.surname !== 'Svensson') {
        throw new Error(\`Kong HSA REST verification failed with \${response.status}: \${JSON.stringify(body).slice(0, 300)}\`)
      }
      return body
    }

    let lastError
    let verified = false
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        const restPerson = await postRest()
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
        SERVICE_NAME,
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
