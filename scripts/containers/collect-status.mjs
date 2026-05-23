import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_COMPOSE_FILE = 'container-stack.compose.yml'
export const DEFAULT_LOCK_FILE = 'container-stack.lock.json'
export const DEFAULT_STATUS_TEXT = 'container-status.txt'
export const DEFAULT_STATUS_JSON = 'container-status.json'
export const DEFAULT_PODMAN_COMPOSE_PROVIDER = 'podman-compose'
export const DEFAULT_PODMAN_STORAGE_DRIVER = 'vfs'
export const DEFAULT_LOG_SERVICES = [
  'sqlserver',
  'keycloak',
  'nginx',
  'db-bootstrap',
  'db-migrate',
  'db-seed-required',
  'db-seed-demo',
  'app-runtime',
]

const USAGE = `Usage:
  node scripts/containers/collect-status.mjs [options]

Options:
  --compose-file <path>    Generated Compose file
  --lock-file <path>       Stack lock JSON file
  --output-text <path>     Text status output
  --output-json <path>     JSON status output
  --project-name <name>    Optional Compose project name
  --tail <lines>           Log tail length`

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function redactSensitiveText(text) {
  return String(text).replace(
    /([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|SESSION_COOKIE_PASSWORD)[A-Z0-9_]*)(=|:)\s*("[^"]*"|'[^']*'|[^\s,;]+)/giu,
    '$1$2 [redacted]',
  )
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function parseComposePsJson(stdout) {
  const parsed = safeJsonParse(stdout, null)
  if (Array.isArray(parsed)) return parsed
  return String(stdout)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => safeJsonParse(line, null))
    .filter(Boolean)
}

export function extractMountedPaths(composeText) {
  return [
    ...new Set(
      String(composeText)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith('- ./') || line.startsWith('- tmp/'))
        .map(line => line.replace(/^- /u, '').split(':')[0])
        .filter(value => !value.includes('.env.') && !value.endsWith('.key')),
    ),
  ].sort()
}

export function buildStatusDocument(status) {
  const lines = [
    `Container status generated at ${status.generatedAt}`,
    `Compose file: ${status.composeFile}`,
    `Project name: ${status.projectName ?? '(not supplied)'}`,
    '',
    'Images:',
    ...status.images.map(
      service =>
        `- ${service.name}: ${service.image}:${service.tag} ${service.digest}`,
    ),
    '',
    'Mounted paths:',
    ...status.mountedPaths.map(mount => `- ${mount}`),
    '',
    'Compose ps:',
    status.psText || JSON.stringify(status.ps, null, 2),
    '',
    'Log tails:',
    ...status.logs.map(log => `\n[${log.service}]\n${log.text}`),
  ]

  return `${redactSensitiveText(lines.join('\n')).trim()}\n`
}

function runPodman(args, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  return execFileSync('podman', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PODMAN_COMPOSE_PROVIDER:
        process.env.PODMAN_COMPOSE_PROVIDER ?? DEFAULT_PODMAN_COMPOSE_PROVIDER,
      STORAGE_DRIVER:
        process.env.STORAGE_DRIVER ?? DEFAULT_PODMAN_STORAGE_DRIVER,
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function composeArgs(composeFile, extraArgs, projectName) {
  return [
    'compose',
    '-f',
    composeFile,
    ...(projectName ? ['--project-name', projectName] : []),
    ...extraArgs,
  ]
}

function projectContainerName(projectName, service) {
  return `${projectName}_${service}_1`
}

function projectPsArgs(projectName) {
  return [
    'ps',
    '--filter',
    `label=io.podman.compose.project=${projectName}`,
    '--all',
    '--format',
    '{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}',
  ]
}

function collectServiceLogs(service, options) {
  const { composeFile, projectName, tail } = options
  try {
    return runPodman(
      composeArgs(
        composeFile,
        ['logs', '--tail', String(tail), '--no-color', service],
        projectName,
      ),
      options,
    )
  } catch {
    if (!projectName)
      throw new Error('Project name is required for log fallback.')
    return runPodman(
      [
        'logs',
        '--tail',
        String(tail),
        projectContainerName(projectName, service),
      ],
      options,
    )
  }
}

export function collectContainerStatus(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const composeFile = options.composeFile ?? DEFAULT_COMPOSE_FILE
  const lockFile = options.lockFile ?? DEFAULT_LOCK_FILE
  const tail = options.tail ?? 80
  const projectName = options.projectName
  const composeText = fsImpl.existsSync(path.resolve(cwd, composeFile))
    ? fsImpl.readFileSync(path.resolve(cwd, composeFile), 'utf8')
    : ''
  const stackLock = fsImpl.existsSync(path.resolve(cwd, lockFile))
    ? JSON.parse(fsImpl.readFileSync(path.resolve(cwd, lockFile), 'utf8'))
    : { services: [] }
  let psText = ''
  let ps = []

  try {
    psText = runPodman(
      composeArgs(composeFile, ['ps', '--format', 'json'], projectName),
      options,
    )
    ps = parseComposePsJson(psText)
  } catch (error) {
    if (!projectName) {
      psText = error instanceof Error ? error.message : String(error)
    } else {
      try {
        psText = runPodman(projectPsArgs(projectName), options)
        ps = parseComposePsJson(psText)
      } catch (fallbackError) {
        psText =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
      }
    }
  }

  const logs = DEFAULT_LOG_SERVICES.map(service => {
    try {
      return {
        service,
        text: redactSensitiveText(
          collectServiceLogs(service, {
            ...options,
            composeFile,
            projectName,
            tail,
          }),
        ),
      }
    } catch {
      return { service, text: '(no logs collected)' }
    }
  })

  return {
    composeFile,
    generatedAt:
      options.generatedAt ??
      (options.now ?? (() => new Date()))().toISOString(),
    images: stackLock.services ?? [],
    logs,
    mountedPaths: extractMountedPaths(composeText),
    projectName,
    ps,
    psText: redactSensitiveText(psText),
  }
}

export function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }

  const rawTail = options.tail ?? '80'
  const tail = Number.parseInt(rawTail, 10)
  if (!/^\d+$/u.test(rawTail) || !Number.isFinite(tail) || tail <= 0) {
    throw new Error('--tail must be a positive integer.')
  }

  return {
    composeFile: readNonEmpty(options['compose-file']) ?? DEFAULT_COMPOSE_FILE,
    lockFile: readNonEmpty(options['lock-file']) ?? DEFAULT_LOCK_FILE,
    outputJson: readNonEmpty(options['output-json']) ?? DEFAULT_STATUS_JSON,
    outputText: readNonEmpty(options['output-text']) ?? DEFAULT_STATUS_TEXT,
    projectName: readNonEmpty(options['project-name']),
    tail,
  }
}

export function writeStatusFiles(status, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const textPath = path.resolve(cwd, options.outputText ?? DEFAULT_STATUS_TEXT)
  const jsonPath = path.resolve(cwd, options.outputJson ?? DEFAULT_STATUS_JSON)
  fsImpl.writeFileSync(textPath, buildStatusDocument(status))
  fsImpl.writeFileSync(jsonPath, `${JSON.stringify(status, null, 2)}\n`)
  return { jsonPath, textPath }
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  try {
    const parsed = parseArgs(args)
    const status = collectContainerStatus({
      composeFile: parsed.composeFile,
      cwd: dependencies.cwd,
      execFileSync: dependencies.execFileSync,
      fsImpl: dependencies.fsImpl,
      lockFile: parsed.lockFile,
      projectName: parsed.projectName,
      tail: parsed.tail,
    })
    const writes = writeStatusFiles(status, {
      cwd: dependencies.cwd,
      fsImpl: dependencies.fsImpl,
      outputJson: parsed.outputJson,
      outputText: parsed.outputText,
    })
    const cwd = dependencies.cwd ?? process.cwd()
    consoleObj.log(`Wrote ${path.relative(cwd, writes.textPath)}`)
    consoleObj.log(`Wrote ${path.relative(cwd, writes.jsonPath)}`)
    return 0
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
