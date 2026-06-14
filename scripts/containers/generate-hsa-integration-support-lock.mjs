import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeServiceRecord,
  SERVICE_FIELDS,
} from './generate-stack-lock.mjs'

export const HSA_INTEGRATION_SUPPORT_LOCK_SCHEMA_VERSION = 1
export const DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_PATH =
  'container-hsa-integration-support.lock.json'
export const GENERATED_BY =
  'scripts/containers/generate-hsa-integration-support-lock.mjs'

export const HSA_INTEGRATION_VENDOR_LOCKS = [
  {
    name: 'kong',
    path: 'containers/kong/image.lock.json',
  },
]

const USAGE = `Usage:
  node scripts/containers/generate-hsa-integration-support-lock.mjs generate --hsa-person-lookup-adapter-manifest-digest <digest> --hsa-person-lookup-adapter-image-id <id> [options]
  node scripts/containers/generate-hsa-integration-support-lock.mjs check [--lock-file container-hsa-integration-support.lock.json]

Generate options:
  --output <path>                                  Output lock file path
  --release-version <version>                      Release or PR version metadata
  --commit-sha <sha>                               Commit SHA metadata
  --generated-at <iso-time>                        Deterministic generation timestamp
  --hsa-person-lookup-adapter-image <image>        Adapter image name
  --hsa-person-lookup-adapter-tag <tag>            Adapter image tag metadata
  --hsa-person-lookup-adapter-manifest-digest <digest>
                                                   Adapter registry manifest digest
  --hsa-person-lookup-adapter-image-id <id>        Adapter image ID
  --hsa-person-lookup-adapter-source <source>      Adapter image source metadata`

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

export function formatHsaIntegrationSupportLockJson(lock) {
  return `${JSON.stringify(lock, null, 2)}\n`
}

export function assertHsaIntegrationSupportLockSchema(
  lock,
  context = DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_PATH,
) {
  if (lock?.schemaVersion !== HSA_INTEGRATION_SUPPORT_LOCK_SCHEMA_VERSION) {
    throw new Error(
      `${context} must use schemaVersion ${HSA_INTEGRATION_SUPPORT_LOCK_SCHEMA_VERSION}.`,
    )
  }
}

export function readHsaIntegrationVendorLocks(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lockFiles = options.lockFiles ?? HSA_INTEGRATION_VENDOR_LOCKS

  return lockFiles.map(lockFile => {
    const filePath = path.resolve(cwd, lockFile.path)
    return normalizeServiceRecord(readJsonFile(filePath, fsImpl), lockFile.path)
  })
}

function sameFieldSet(actual) {
  const actualFields = Object.keys(actual).sort()
  return (
    JSON.stringify(actualFields) === JSON.stringify([...SERVICE_FIELDS].sort())
  )
}

function findService(lock, name) {
  return lock.services?.find(service => service.name === name) ?? null
}

function assertExactServiceMatch(actual, expected) {
  if (!actual) {
    throw new Error(
      `${DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_PATH} is missing "${expected.name}".`,
    )
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

export function checkHsaIntegrationSupportVendorLocks(lock, vendorLocks) {
  assertHsaIntegrationSupportLockSchema(lock)
  if (!Array.isArray(lock.services)) {
    throw new Error(
      `${DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_PATH} must contain services[].`,
    )
  }

  for (const expected of vendorLocks) {
    assertExactServiceMatch(findService(lock, expected.name), expected)
  }

  const adapter = findService(lock, 'hsa-person-lookup-adapter')
  if (!adapter) {
    throw new Error(
      `${DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_PATH} is missing "hsa-person-lookup-adapter".`,
    )
  }
  normalizeServiceRecord(adapter, 'hsa-person-lookup-adapter')

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

function projectServiceOptions(prefix, options, env, defaults) {
  const envPrefix = prefix.toUpperCase().replaceAll('-', '_')
  return {
    image:
      readNonEmpty(options[`${prefix}-image`]) ??
      readNonEmpty(env[`${envPrefix}_IMAGE`]) ??
      defaults.image,
    imageId:
      readNonEmpty(options[`${prefix}-image-id`]) ??
      readNonEmpty(env[`${envPrefix}_IMAGE_ID`]),
    manifestDigest:
      readNonEmpty(options[`${prefix}-manifest-digest`]) ??
      readNonEmpty(env[`${envPrefix}_MANIFEST_DIGEST`]),
    source:
      readNonEmpty(options[`${prefix}-source`]) ??
      readNonEmpty(env[`${envPrefix}_SOURCE`]) ??
      defaults.source,
    tag:
      readNonEmpty(options[`${prefix}-tag`]) ??
      readNonEmpty(env[`${envPrefix}_TAG`]) ??
      defaults.tag,
  }
}

function createProjectService(name, role, options) {
  return normalizeServiceRecord(
    {
      image: options.image,
      imageId: options.imageId,
      manifestDigest: options.manifestDigest,
      name,
      role,
      source: options.source,
      tag: options.tag,
    },
    name,
  )
}

export function createHsaIntegrationSupportLock(options) {
  const vendorLocks = options.vendorLocks ?? []
  const generatedAt =
    readNonEmpty(options.generatedAt) ??
    (options.now ?? (() => new Date()))().toISOString()

  return {
    schemaVersion: HSA_INTEGRATION_SUPPORT_LOCK_SCHEMA_VERSION,
    releaseVersion: readNonEmpty(options.releaseVersion) ?? '0.0.0-local',
    commitSha: readNonEmpty(options.commitSha) ?? 'unknown',
    generatedAt,
    generatedBy: GENERATED_BY,
    services: [
      ...vendorLocks.map((service, index) =>
        normalizeServiceRecord(service, `HSA integration vendor ${index + 1}`),
      ),
      createProjectService(
        'hsa-person-lookup-adapter',
        'hsa-person-lookup-adapter',
        options.hsaPersonLookupAdapter,
      ),
    ],
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

export function createHsaIntegrationSupportLockFromCliOptions(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const cliOptions = options.cliOptions ?? {}
  const releaseVersion =
    readNonEmpty(cliOptions['release-version']) ??
    readNonEmpty(env.RELEASE_VERSION) ??
    readNonEmpty(env.BUILD_VERSION) ??
    readPackageVersion(cwd, fsImpl)
  const commitSha =
    readNonEmpty(cliOptions['commit-sha']) ??
    readNonEmpty(env.COMMIT_SHA) ??
    readNonEmpty(env.BUILD_COMMIT_SHA) ??
    readNonEmpty(env.GITHUB_SHA) ??
    readGitCommitSha(cwd, execFileSync)

  return createHsaIntegrationSupportLock({
    releaseVersion,
    commitSha,
    generatedAt: cliOptions['generated-at'],
    vendorLocks: readHsaIntegrationVendorLocks({ cwd, fsImpl }),
    hsaPersonLookupAdapter: projectServiceOptions(
      'hsa-person-lookup-adapter',
      cliOptions,
      env,
      {
        image: 'localhost/kravhantering/hsa-person-lookup-adapter',
        tag: 'local',
        source: 'local-build',
      },
    ),
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
      options['lock-file'] ??
        options.output ??
        DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_PATH,
    )

    if (command === 'generate') {
      const lock = createHsaIntegrationSupportLockFromCliOptions({
        cwd,
        env,
        fsImpl,
        execFileSync,
        cliOptions: options,
      })
      writeTextFile(lockFile, formatHsaIntegrationSupportLockJson(lock), fsImpl)
      consoleObj.log(`Wrote ${path.relative(cwd, lockFile)}`)
      return 0
    }

    if (command === 'check') {
      const lock = readJsonFile(lockFile, fsImpl)
      checkHsaIntegrationSupportVendorLocks(
        lock,
        readHsaIntegrationVendorLocks({ cwd, fsImpl }),
      )
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
