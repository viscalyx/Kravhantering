import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertStackLockSchema,
  DEFAULT_STACK_LOCK_PATH,
  findService,
} from './generate-stack-lock.mjs'

export const DEFAULT_TEMPLATE_PATH =
  'containers/compose/container-stack.template.yml'
export const DEFAULT_COMPOSE_OUTPUT_PATH = 'container-stack.compose.yml'
export const DEFAULT_PROJECT_NAME = 'kravhantering-container-stack'
export const DEFAULT_SQLSERVER_VOLUME_NAME =
  'kravhantering-container-stack-sqlserver-data'
export const DEFAULT_TLS_DIR = './tmp/container-tls'
export const DEFAULT_SQLSERVER_HOST_PORT = '127.0.0.1:1433'
export const PROJECT_SERVICE_NAMES = new Set(['app-runtime', 'db-job'])
export const VENDOR_SERVICE_NAMES = new Set(['nginx', 'sqlserver', 'keycloak'])

const USAGE = `Usage:
  node scripts/containers/generate-compose.mjs --mode <pr|release> [options]

Options:
  --lock-file <path>             Stack lock file path
  --template <path>              Source-controlled Compose template
  --output <path>                Generated Compose output path
  --project-name <name>          Compose project name
  --tls-dir <path>               Runtime TLS directory mounted into nginx/app
  --sqlserver-volume-name <name> SQL Server named volume
  --sqlserver-host-port <value>  Host bind value, for example 127.0.0.1:1433`

function readJsonFile(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
}

function writeTextFile(filePath, content, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content)
}

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
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

  return options
}

function requireService(stackLock, name) {
  const service = findService(stackLock, name)
  if (!service) {
    throw new Error(`container-stack.lock.json is missing "${name}".`)
  }
  return service
}

export function imageReference(service, mode) {
  if (VENDOR_SERVICE_NAMES.has(service.name)) {
    return `${service.image}@${service.manifestDigest}`
  }

  if (!PROJECT_SERVICE_NAMES.has(service.name)) {
    throw new Error(
      `Unsupported service in Compose generation: ${service.name}`,
    )
  }

  if (mode === 'pr') {
    return `${service.image}:${service.tag}`
  }

  if (mode === 'release') {
    return `${service.image}@${service.manifestDigest}`
  }

  throw new Error(`Unsupported Compose generation mode: ${mode}`)
}

export function buildComposeValues(stackLock, options = {}) {
  assertStackLockSchema(stackLock)
  const mode = options.mode ?? 'pr'
  const services = {
    appRuntime: requireService(stackLock, 'app-runtime'),
    dbJob: requireService(stackLock, 'db-job'),
    nginx: requireService(stackLock, 'nginx'),
    sqlserver: requireService(stackLock, 'sqlserver'),
    keycloak: requireService(stackLock, 'keycloak'),
  }

  return {
    appRuntimeImage: imageReference(services.appRuntime, mode),
    dbJobImage: imageReference(services.dbJob, mode),
    keycloakImage: imageReference(services.keycloak, mode),
    nginxImage: imageReference(services.nginx, mode),
    projectName: readNonEmpty(options.projectName) ?? DEFAULT_PROJECT_NAME,
    sqlServerHostPort:
      readNonEmpty(options.sqlServerHostPort) ?? DEFAULT_SQLSERVER_HOST_PORT,
    sqlServerImage: imageReference(services.sqlserver, mode),
    sqlServerVolumeName:
      readNonEmpty(options.sqlServerVolumeName) ??
      DEFAULT_SQLSERVER_VOLUME_NAME,
    tlsDir: readNonEmpty(options.tlsDir) ?? DEFAULT_TLS_DIR,
  }
}

export function renderTemplate(template, values) {
  const rendered = template.replace(
    /\{\{([A-Za-z0-9_]+)\}\}/g,
    (match, key) => {
      if (!(key in values)) {
        throw new Error(`Template placeholder ${match} has no value.`)
      }
      return values[key]
    },
  )

  const unresolved = rendered.match(/\{\{[A-Za-z0-9_]+\}\}/g)
  if (unresolved) {
    throw new Error(
      `Template has unresolved placeholders: ${unresolved.join(', ')}`,
    )
  }

  return rendered
}

export function generateCompose(template, stackLock, options = {}) {
  const mode = options.mode ?? 'pr'
  if (!['pr', 'release'].includes(mode)) {
    throw new Error(`Unsupported Compose generation mode: ${mode}`)
  }

  return renderTemplate(
    template,
    buildComposeValues(stackLock, {
      mode,
      projectName: options.projectName,
      sqlServerHostPort: options.sqlServerHostPort,
      sqlServerVolumeName: options.sqlServerVolumeName,
      tlsDir: options.tlsDir,
    }),
  )
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const cwd = dependencies.cwd ?? process.cwd()
  const fsImpl = dependencies.fsImpl ?? fs

  try {
    const options = parseArgs(args)
    const mode = options.mode ?? 'pr'
    const lockFile = path.resolve(
      cwd,
      options['lock-file'] ?? DEFAULT_STACK_LOCK_PATH,
    )
    const templatePath = path.resolve(
      cwd,
      options.template ?? DEFAULT_TEMPLATE_PATH,
    )
    const outputPath = path.resolve(
      cwd,
      options.output ?? DEFAULT_COMPOSE_OUTPUT_PATH,
    )
    const stackLock = readJsonFile(lockFile, fsImpl)
    const template = fsImpl.readFileSync(templatePath, 'utf8')
    const compose = generateCompose(template, stackLock, {
      mode,
      projectName: options['project-name'],
      sqlServerHostPort: options['sqlserver-host-port'],
      sqlServerVolumeName: options['sqlserver-volume-name'],
      tlsDir: options['tls-dir'],
    })

    writeTextFile(outputPath, compose, fsImpl)
    consoleObj.log(`Wrote ${path.relative(cwd, outputPath)}`)
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
