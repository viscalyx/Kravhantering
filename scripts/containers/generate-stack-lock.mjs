import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

export const STACK_LOCK_SCHEMA_VERSION = 2
export const DEFAULT_STACK_LOCK_PATH = 'container-stack.lock.json'
export const DEFAULT_STACK_LOCK_SCHEMA_PATH =
  'containers/compose/container-stack-lock.schema.json'
export const GENERATED_BY = 'scripts/containers/generate-stack-lock.mjs'

export const VENDOR_LOCKS = [
  {
    name: 'nginx',
    path: 'containers/nginx/image.lock.json',
  },
  {
    name: 'sqlserver',
    path: 'containers/sqlserver/image.lock.json',
  },
  {
    name: 'keycloak',
    path: 'containers/keycloak/image.lock.json',
  },
]

export const SERVICE_FIELDS = [
  'name',
  'role',
  'image',
  'tag',
  'manifestDigest',
  'imageId',
  'source',
]

const USAGE = `Usage:
  node scripts/containers/generate-stack-lock.mjs generate --app-manifest-digest <digest> --app-image-id <id> --db-job-manifest-digest <digest> --db-job-image-id <id> [options]
  node scripts/containers/generate-stack-lock.mjs check [--lock-file container-stack.lock.json]

Generate options:
  --output <path>              Output lock file path
  --release-version <version>  Release or PR version metadata
  --commit-sha <sha>           Commit SHA metadata
  --generated-at <iso-time>    Deterministic generation timestamp
  --app-image <image>          app-runtime image name
  --app-tag <tag>              app-runtime tag metadata
  --app-manifest-digest <digest>
                               app-runtime registry manifest digest
  --app-image-id <id>          app-runtime image ID
  --app-source <source>        app-runtime source metadata
                                --app-runtime-* aliases are also accepted
  --db-job-image <image>       db-job image name
  --db-job-tag <tag>           db-job tag metadata
  --db-job-manifest-digest <digest>
                               db-job registry manifest digest
  --db-job-image-id <id>       db-job image ID
  --db-job-source <source>     db-job source metadata`

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readJsonFile(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
}

function writeTextFile(filePath, content, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, content)
}

function stackLockSchemaPath() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    DEFAULT_STACK_LOCK_SCHEMA_PATH,
  )
}

let stackLockSchemaValidator

function stackLockSchemaValidate() {
  if (!stackLockSchemaValidator) {
    const schema = readJsonFile(stackLockSchemaPath())
    const ajv = new Ajv({ allErrors: true, strict: true })
    stackLockSchemaValidator = ajv.compile(schema)
  }
  return stackLockSchemaValidator
}

function schemaLocation(error) {
  return error.instancePath || '/'
}

function schemaErrorMessage(error) {
  const location = schemaLocation(error)

  if (error.keyword === 'required') {
    return `${location} must include required field "${error.params.missingProperty}"`
  }

  if (error.keyword === 'additionalProperties') {
    return `${location} must not include unknown field "${error.params.additionalProperty}"`
  }

  if (error.keyword === 'pattern') {
    return `${location} must match ${error.params.pattern}`
  }

  if (error.keyword === 'const') {
    return `${location} must equal ${JSON.stringify(error.params.allowedValue)}`
  }

  return `${location} ${error.message}`
}

function formatStackLockSchemaErrors(errors = []) {
  return errors.map(schemaErrorMessage).join('; ')
}

export function formatStackLockJson(stackLock) {
  return `${JSON.stringify(stackLock, null, 2)}\n`
}

export function assertStackLockSchema(
  stackLock,
  context = 'container-stack.lock.json',
) {
  if (stackLock?.schemaVersion !== STACK_LOCK_SCHEMA_VERSION) {
    throw new Error(
      `${context} must use schemaVersion ${STACK_LOCK_SCHEMA_VERSION}.`,
    )
  }
  const validate = stackLockSchemaValidate()
  if (!validate(stackLock)) {
    throw new Error(
      `${context} does not match ${DEFAULT_STACK_LOCK_SCHEMA_PATH}: ${formatStackLockSchemaErrors(validate.errors)}`,
    )
  }
  return true
}

export function normalizeServiceRecord(record, context) {
  const normalized = {}
  for (const field of SERVICE_FIELDS) {
    const value = readNonEmpty(record[field])
    if (!value) {
      throw new Error(`${context} is missing required field "${field}".`)
    }
    normalized[field] = value
  }
  return normalized
}

export function readVendorLocks(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lockFiles = options.lockFiles ?? VENDOR_LOCKS

  return lockFiles.map(lockFile => {
    const filePath = path.resolve(cwd, lockFile.path)
    return normalizeServiceRecord(readJsonFile(filePath, fsImpl), lockFile.path)
  })
}

function createProjectService(name, role, options) {
  return normalizeServiceRecord(
    {
      name,
      role,
      image: options.image,
      tag: options.tag,
      manifestDigest: options.manifestDigest,
      imageId: options.imageId,
      source: options.source,
    },
    name,
  )
}

export function createStackLock(options) {
  const vendorLocks = options.vendorLocks ?? []
  const generatedAt =
    readNonEmpty(options.generatedAt) ??
    (options.now ?? (() => new Date()))().toISOString()

  return {
    schemaVersion: STACK_LOCK_SCHEMA_VERSION,
    releaseVersion: readNonEmpty(options.releaseVersion) ?? '0.0.0-local',
    commitSha: readNonEmpty(options.commitSha) ?? 'unknown',
    generatedAt,
    generatedBy: GENERATED_BY,
    services: [
      createProjectService('app-runtime', 'application', options.appRuntime),
      createProjectService('db-job', 'database-job', options.dbJob),
      ...vendorLocks.map((service, index) =>
        normalizeServiceRecord(service, `vendor service ${index + 1}`),
      ),
    ],
  }
}

export function findService(stackLock, name) {
  return stackLock.services?.find(service => service.name === name) ?? null
}

function sameFieldSet(actual) {
  const actualFields = Object.keys(actual).sort()
  return (
    JSON.stringify(actualFields) === JSON.stringify([...SERVICE_FIELDS].sort())
  )
}

function assertExactServiceMatch(actual, expected) {
  if (!actual) {
    throw new Error(`container-stack.lock.json is missing "${expected.name}".`)
  }

  if (!sameFieldSet(actual)) {
    throw new Error(
      `Service "${expected.name}" has fields that do not match image.lock.json.`,
    )
  }

  for (const field of SERVICE_FIELDS) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `Service "${expected.name}" differs from image.lock.json at "${field}".`,
      )
    }
  }
}

export function checkVendorLocks(stackLock, vendorLocks) {
  assertStackLockSchema(stackLock)
  if (!Array.isArray(stackLock.services)) {
    throw new Error('container-stack.lock.json must contain services[].')
  }

  for (const expected of vendorLocks) {
    assertExactServiceMatch(findService(stackLock, expected.name), expected)
  }

  return true
}

function readPackageVersion(cwd, fsImpl = fs) {
  try {
    const pkg = readJsonFile(path.join(cwd, 'package.json'), fsImpl)
    return readNonEmpty(pkg.version)
  } catch {
    return undefined
  }
}

function readGitCommitSha(cwd, execFileSync = childProcess.execFileSync) {
  try {
    return readNonEmpty(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    return undefined
  }
}

export function parseArgs(args) {
  const [command, ...rest] = args
  const options = {}

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }

    options[key] = value
    index += 1
  }

  return { command, options }
}

function envValue(env, names) {
  for (const name of names) {
    const value = readNonEmpty(env[name])
    if (value) return value
  }
  return undefined
}

function projectServiceOptions(prefix, options, env, defaults) {
  const envPrefix = prefix.toUpperCase().replaceAll('-', '_')
  const optionPrefixes = prefix === 'app' ? ['app', 'app-runtime'] : [prefix]
  return {
    image:
      envValue(
        options,
        optionPrefixes.map(name => `${name}-image`),
      ) ??
      envValue(env, [
        `${envPrefix}_IMAGE`,
        prefix === 'app' ? 'APP_RUNTIME_IMAGE' : '',
      ]) ??
      defaults.image,
    tag:
      envValue(
        options,
        optionPrefixes.map(name => `${name}-tag`),
      ) ??
      envValue(env, [
        `${envPrefix}_TAG`,
        prefix === 'app' ? 'APP_RUNTIME_TAG' : '',
      ]) ??
      defaults.tag,
    manifestDigest:
      envValue(
        options,
        optionPrefixes.map(name => `${name}-manifest-digest`),
      ) ??
      envValue(env, [
        `${envPrefix}_MANIFEST_DIGEST`,
        prefix === 'app' ? 'APP_RUNTIME_MANIFEST_DIGEST' : '',
      ]),
    imageId:
      envValue(
        options,
        optionPrefixes.map(name => `${name}-image-id`),
      ) ??
      envValue(env, [
        `${envPrefix}_IMAGE_ID`,
        prefix === 'app' ? 'APP_RUNTIME_IMAGE_ID' : '',
      ]),
    source:
      envValue(
        options,
        optionPrefixes.map(name => `${name}-source`),
      ) ??
      envValue(env, [
        `${envPrefix}_SOURCE`,
        prefix === 'app' ? 'APP_RUNTIME_SOURCE' : '',
      ]) ??
      defaults.source,
  }
}

export function createStackLockFromCliOptions(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const cliOptions = options.cliOptions ?? {}
  const releaseVersion =
    readNonEmpty(cliOptions['release-version']) ??
    readNonEmpty(env.RELEASE_VERSION) ??
    readNonEmpty(env.BUILD_VERSION) ??
    readNonEmpty(env.GITVERSION_FULLSEMVER) ??
    readPackageVersion(cwd, fsImpl)
  const commitSha =
    readNonEmpty(cliOptions['commit-sha']) ??
    readNonEmpty(env.COMMIT_SHA) ??
    readNonEmpty(env.BUILD_COMMIT_SHA) ??
    readNonEmpty(env.GITHUB_SHA) ??
    readGitCommitSha(cwd, execFileSync)

  return createStackLock({
    releaseVersion,
    commitSha,
    generatedAt: cliOptions['generated-at'],
    vendorLocks: readVendorLocks({ cwd, fsImpl }),
    appRuntime: projectServiceOptions('app', cliOptions, env, {
      image: 'localhost/kravhantering/app-runtime',
      tag: 'local',
      source: 'local-build',
    }),
    dbJob: projectServiceOptions('db-job', cliOptions, env, {
      image: 'localhost/kravhantering/db-job',
      tag: 'local',
      source: 'local-build',
    }),
  })
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const cwd = dependencies.cwd ?? process.cwd()
  const fsImpl = dependencies.fsImpl ?? fs
  const env = dependencies.env ?? process.env
  const execFileSync = dependencies.execFileSync ?? childProcess.execFileSync

  try {
    const { command, options } = parseArgs(args)
    const lockFile = path.resolve(
      cwd,
      options['lock-file'] ?? options.output ?? DEFAULT_STACK_LOCK_PATH,
    )

    if (command === 'generate') {
      const stackLock = createStackLockFromCliOptions({
        cwd,
        env,
        fsImpl,
        execFileSync,
        cliOptions: options,
      })
      writeTextFile(lockFile, formatStackLockJson(stackLock), fsImpl)
      consoleObj.log(`Wrote ${path.relative(cwd, lockFile)}`)
      return 0
    }

    if (command === 'check') {
      const stackLock = readJsonFile(lockFile, fsImpl)
      checkVendorLocks(stackLock, readVendorLocks({ cwd, fsImpl }))
      consoleObj.log(`Checked ${path.relative(cwd, lockFile)}`)
      return 0
    }

    consoleObj.error(USAGE)
    return 1
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
