import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENV_FILE_CONFIGS = {
  app: {
    examplePath: 'containers/app/.env.app.example',
    localPath: 'containers/app/.env.app.local',
  },
  'db-job': {
    examplePath: 'containers/db-job/.env.db-job.example',
    localPath: 'containers/db-job/.env.db-job.local',
  },
  keycloak: {
    examplePath: 'containers/keycloak/.env.keycloak.demo.example',
    localPath: 'containers/keycloak/.env.keycloak.local',
  },
  sqlserver: {
    examplePath: 'containers/sqlserver/.env.sqlserver.example',
    localPath: 'containers/sqlserver/.env.sqlserver.local',
  },
}

const USAGE = `Usage:
  node scripts/containers/write-env-local.mjs <app|db-job|keycloak|sqlserver|all> [--set KEY=VALUE] [--force]

Examples:
  node scripts/containers/write-env-local.mjs all
  node scripts/containers/write-env-local.mjs app --set DB_PASSWORD=... --force`

function isEnvKey(value) {
  return /^[A-Z][A-Z0-9_]*$/.test(value)
}

export function parseOverride(value) {
  const separator = value.indexOf('=')
  if (separator < 1) {
    throw new Error(`Invalid --set value "${value}". Use KEY=VALUE.`)
  }

  const key = value.slice(0, separator)
  if (!isEnvKey(key)) {
    throw new Error(`Invalid environment key "${key}".`)
  }

  return [key, value.slice(separator + 1)]
}

export function parseArgs(args) {
  const [container = '', ...rest] = args
  const overrides = new Map()
  let force = false

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--force') {
      force = true
      continue
    }

    if (arg === '--set') {
      const value = rest[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --set.')
      }
      overrides.set(...parseOverride(value))
      index += 1
      continue
    }

    throw new Error(`Unexpected argument: ${arg}`)
  }

  return { container, force, overrides }
}

function stripMatchingQuotes(value) {
  const trimmed = value.trim()
  if (trimmed.length < 2) return value
  const quote = trimmed[0]
  return (quote === '"' || quote === "'") && trimmed.at(-1) === quote
    ? trimmed.slice(1, -1)
    : value
}

function normalizeEnvLocalValue(key, value, options = {}) {
  if (options.container === 'app' && key === 'AUTH_OIDC_SCOPES') {
    return stripMatchingQuotes(value)
  }
  return value
}

export function buildEnvLocalContent(exampleContent, overrides, options = {}) {
  const remaining = new Map(overrides)
  const lines = exampleContent.split(/\r?\n/)
  const rendered = lines.map(line => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match) {
      return line
    }

    const key = match[1]
    const value = remaining.has(key) ? remaining.get(key) : match[2]
    remaining.delete(key)
    return `${key}=${normalizeEnvLocalValue(key, value, options)}`
  })

  if (remaining.size > 0) {
    if (rendered.at(-1) !== '') {
      rendered.push('')
    }
    rendered.push('# Runtime overrides supplied by write-env-local.mjs.')
    for (const [key, value] of remaining.entries()) {
      rendered.push(`${key}=${normalizeEnvLocalValue(key, value, options)}`)
    }
  }

  return `${rendered.join('\n').replace(/\n+$/u, '')}\n`
}

function selectedConfigs(container) {
  if (container === 'all') {
    return Object.entries(ENV_FILE_CONFIGS)
  }

  if (!Object.hasOwn(ENV_FILE_CONFIGS, container)) {
    throw new Error(
      `Unknown container "${container}". Expected app, db-job, keycloak, sqlserver, or all.`,
    )
  }

  return [[container, ENV_FILE_CONFIGS[container]]]
}

export function planEnvLocalWrites(options) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const force = options.force ?? false
  const overrides = options.overrides ?? new Map()

  if (options.container === 'all' && overrides.size > 0) {
    throw new Error('Pass --set overrides with a single container, not all.')
  }

  return selectedConfigs(options.container).map(([container, config]) => {
    const examplePath = path.resolve(cwd, config.examplePath)
    const localPath = path.resolve(cwd, config.localPath)

    if (!force && fsImpl.existsSync(localPath)) {
      throw new Error(
        `${config.localPath} already exists. Pass --force to replace it.`,
      )
    }

    return {
      container,
      localPath,
      relativeLocalPath: config.localPath,
      content: buildEnvLocalContent(
        fsImpl.readFileSync(examplePath, 'utf8'),
        overrides,
        { container },
      ),
    }
  })
}

export function writeEnvLocalFiles(options) {
  const fsImpl = options.fsImpl ?? fs
  const writes = planEnvLocalWrites(options)

  for (const write of writes) {
    fsImpl.mkdirSync(path.dirname(write.localPath), { recursive: true })
    fsImpl.writeFileSync(write.localPath, write.content)
  }

  return writes
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const cwd = dependencies.cwd ?? process.cwd()
  const fsImpl = dependencies.fsImpl ?? fs

  try {
    const parsed = parseArgs(args)
    if (!parsed.container) {
      consoleObj.error(USAGE)
      return 1
    }

    const writes = writeEnvLocalFiles({
      container: parsed.container,
      cwd,
      force: parsed.force,
      fsImpl,
      overrides: parsed.overrides,
    })
    for (const write of writes) {
      consoleObj.log(`Wrote ${write.relativeLocalPath}`)
    }
    return 0
  } catch (error) {
    consoleObj.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2))
}
