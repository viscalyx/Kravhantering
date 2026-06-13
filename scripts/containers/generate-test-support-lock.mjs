import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeServiceRecord,
  SERVICE_FIELDS,
} from './generate-stack-lock.mjs'

export const TEST_SUPPORT_LOCK_SCHEMA_VERSION = 1
export const DEFAULT_TEST_SUPPORT_LOCK_PATH = 'container-test-support.lock.json'
export const GENERATED_BY = 'scripts/containers/generate-test-support-lock.mjs'

export const TEST_SUPPORT_VENDOR_LOCKS = [
  {
    name: 'kong',
    path: 'containers/kong/image.lock.json',
  },
]

const USAGE = `Usage:
  node scripts/containers/generate-test-support-lock.mjs generate --hsa-directory-mock-manifest-digest <digest> --hsa-directory-mock-image-id <id> [options]
  node scripts/containers/generate-test-support-lock.mjs check [--lock-file container-test-support.lock.json]

Generate options:
  --output <path>                         Output lock file path
  --release-version <version>             Release or PR version metadata
  --commit-sha <sha>                      Commit SHA metadata
  --generated-at <iso-time>               Deterministic generation timestamp
  --hsa-directory-mock-image <image>       HSA directory mock image name
  --hsa-directory-mock-tag <tag>           HSA directory mock tag metadata
  --hsa-directory-mock-manifest-digest <digest>
                                          HSA directory mock registry manifest digest
  --hsa-directory-mock-image-id <id>       HSA directory mock image ID
  --hsa-directory-mock-source <source>     HSA directory mock source metadata`

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

export function formatTestSupportLockJson(lock) {
  return `${JSON.stringify(lock, null, 2)}\n`
}

export function assertTestSupportLockSchema(
  lock,
  context = DEFAULT_TEST_SUPPORT_LOCK_PATH,
) {
  if (lock?.schemaVersion !== TEST_SUPPORT_LOCK_SCHEMA_VERSION) {
    throw new Error(
      `${context} must use schemaVersion ${TEST_SUPPORT_LOCK_SCHEMA_VERSION}.`,
    )
  }
}

export function readTestSupportVendorLocks(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lockFiles = options.lockFiles ?? TEST_SUPPORT_VENDOR_LOCKS

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
      `${DEFAULT_TEST_SUPPORT_LOCK_PATH} is missing "${expected.name}".`,
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

export function checkTestSupportVendorLocks(lock, vendorLocks) {
  assertTestSupportLockSchema(lock)
  if (!Array.isArray(lock.services)) {
    throw new Error(
      `${DEFAULT_TEST_SUPPORT_LOCK_PATH} must contain services[].`,
    )
  }

  for (const expected of vendorLocks) {
    assertExactServiceMatch(findService(lock, expected.name), expected)
  }

  const hsaDirectoryMock = findService(lock, 'hsa-directory-mock')
  if (!hsaDirectoryMock) {
    throw new Error(
      `${DEFAULT_TEST_SUPPORT_LOCK_PATH} is missing "hsa-directory-mock".`,
    )
  }
  normalizeServiceRecord(hsaDirectoryMock, 'hsa-directory-mock')

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

function testSupportProjectServiceOptions(prefix, options, env, defaults) {
  const envPrefix = prefix.toUpperCase().replaceAll('-', '_')
  return {
    image:
      readNonEmpty(options[`${prefix}-image`]) ??
      readNonEmpty(env[`${envPrefix}_IMAGE`]) ??
      defaults.image,
    tag:
      readNonEmpty(options[`${prefix}-tag`]) ??
      readNonEmpty(env[`${envPrefix}_TAG`]) ??
      defaults.tag,
    manifestDigest:
      readNonEmpty(options[`${prefix}-manifest-digest`]) ??
      readNonEmpty(env[`${envPrefix}_MANIFEST_DIGEST`]),
    imageId:
      readNonEmpty(options[`${prefix}-image-id`]) ??
      readNonEmpty(env[`${envPrefix}_IMAGE_ID`]),
    source:
      readNonEmpty(options[`${prefix}-source`]) ??
      readNonEmpty(env[`${envPrefix}_SOURCE`]) ??
      defaults.source,
  }
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

export function createTestSupportLock(options) {
  const vendorLocks = options.vendorLocks ?? []
  const generatedAt =
    readNonEmpty(options.generatedAt) ??
    (options.now ?? (() => new Date()))().toISOString()

  return {
    schemaVersion: TEST_SUPPORT_LOCK_SCHEMA_VERSION,
    releaseVersion: readNonEmpty(options.releaseVersion) ?? '0.0.0-local',
    commitSha: readNonEmpty(options.commitSha) ?? 'unknown',
    generatedAt,
    generatedBy: GENERATED_BY,
    services: [
      ...vendorLocks.map((service, index) =>
        normalizeServiceRecord(service, `test support vendor ${index + 1}`),
      ),
      createProjectService(
        'hsa-directory-mock',
        'hsa-directory-test-support',
        options.hsaDirectoryMock,
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

export function createTestSupportLockFromCliOptions(options = {}) {
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

  return createTestSupportLock({
    releaseVersion,
    commitSha,
    generatedAt: cliOptions['generated-at'],
    vendorLocks: readTestSupportVendorLocks({ cwd, fsImpl }),
    hsaDirectoryMock: testSupportProjectServiceOptions(
      'hsa-directory-mock',
      cliOptions,
      env,
      {
        image: 'localhost/kravhantering/hsa-directory-mock',
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
      options['lock-file'] ?? options.output ?? DEFAULT_TEST_SUPPORT_LOCK_PATH,
    )

    if (command === 'generate') {
      const lock = createTestSupportLockFromCliOptions({
        cwd,
        env,
        fsImpl,
        execFileSync,
        cliOptions: options,
      })
      writeTextFile(lockFile, formatTestSupportLockJson(lock), fsImpl)
      consoleObj.log(`Wrote ${path.relative(cwd, lockFile)}`)
      return 0
    }

    if (command === 'check') {
      const lock = readJsonFile(lockFile, fsImpl)
      checkTestSupportVendorLocks(
        lock,
        readTestSupportVendorLocks({ cwd, fsImpl }),
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
