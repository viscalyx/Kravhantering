import childProcess from 'node:child_process'
import os from 'node:os'

const SERVICE_NAME = 'kong'
const APP_SERVICE_NAME = 'app'
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
  node scripts/devcontainer/kong.mjs <config|pull|up|recreate|status|logs|restart|down> [docker compose args]`

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
  return state === 'running' || status.includes('up')
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
  return hostRoot
    ? {
        env: {
          WORKSPACE_HOST_ROOT: hostRoot,
        },
      }
    : {}
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

  const kongProfile = PROFILES.find(profile =>
    Boolean(runningService(profile, SERVICE_NAME)),
  )
  return kongProfile ?? PROFILES[0]
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

function runStatus(profile, options) {
  assertSuccess(
    runCompose(profile, ['ps', SERVICE_NAME], options),
    'docker compose ps kong',
  )

  const app = runningService(profile, APP_SERVICE_NAME)
  if (!app) {
    throw new Error(
      'Cannot verify http://kong:8001/status because the app service is not running.',
    )
  }

  const statusScript = `
    const response = await fetch('http://kong:8001/status')
    if (!response.ok) {
      throw new Error(\`Kong Admin API returned \${response.status}\`)
    }
    const body = await response.json()
    console.log(JSON.stringify(body, null, 2))
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
        statusScript,
      ],
      options,
    ),
    'Kong Admin API status check',
  )
}

function runAction(action, extraArgs, profile) {
  printProfile(profile)
  const options = composeRunOptions(profile)

  if (action === 'config') {
    return assertSuccess(
      runCompose(profile, ['config', SERVICE_NAME], options),
      'docker compose config kong',
    )
  }

  if (action === 'pull') {
    return assertSuccess(
      runCompose(profile, ['pull', SERVICE_NAME], options),
      'docker compose pull kong',
    )
  }

  if (action === 'up') {
    return assertSuccess(
      runCompose(profile, ['up', '-d', SERVICE_NAME], options),
      'docker compose up kong',
    )
  }

  if (action === 'recreate') {
    return assertSuccess(
      runCompose(
        profile,
        ['up', '-d', '--force-recreate', '--no-deps', SERVICE_NAME],
        options,
      ),
      'docker compose recreate kong',
    )
  }

  if (action === 'status') return runStatus(profile, options)

  if (action === 'logs') {
    return assertSuccess(
      runCompose(
        profile,
        ['logs', '--tail=120', ...extraArgs, SERVICE_NAME],
        options,
      ),
      'docker compose logs kong',
    )
  }

  if (action === 'restart') {
    return assertSuccess(
      runCompose(profile, ['restart', SERVICE_NAME], options),
      'docker compose restart kong',
    )
  }

  if (action === 'down') {
    return assertSuccess(
      runCompose(profile, ['rm', '--stop', '--force', SERVICE_NAME], options),
      'docker compose rm kong',
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
