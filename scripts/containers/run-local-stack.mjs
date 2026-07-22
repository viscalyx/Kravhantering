import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_INTERNAL_NETWORK_NAME } from './generate-compose.mjs'
import { assertHsaIntegrationSupportLockSchema } from './generate-hsa-integration-support-lock.mjs'
import { assertStackLockSchema } from './generate-stack-lock.mjs'
import { assertTestSupportLockSchema } from './generate-test-support-lock.mjs'

// cSpell:ignore noheading

export const DEFAULT_COMPOSE_FILE = 'container-stack.compose.yml'
export const DEFAULT_LOCK_FILE = 'container-stack.lock.json'
export const DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_FILE =
  'container-hsa-integration-support.lock.json'
export const DEFAULT_STATE_FILE = 'tmp/container-stack-local-state.json'
export const DEFAULT_TEST_SUPPORT_LOCK_FILE = 'container-test-support.lock.json'
export const DEFAULT_TLS_DIR = './tmp/container-tls'
export const DEFAULT_PODMAN_COMPOSE_PROVIDER = 'podman-compose'
export const DEFAULT_PODMAN_STORAGE_DRIVER = 'vfs'
export const DEFAULT_TEST_SQLSERVER_HOST_PORT = '127.0.0.1:15433'
export const DEFAULT_RELEASE_SMOKE_SQLSERVER_HOST_PORT = '127.0.0.1:15435'
export const LOCAL_APP_IMAGE_NAME = 'localhost/kravhantering/app-runtime'
export const LOCAL_DB_JOB_IMAGE_NAME = 'localhost/kravhantering/db-job'
export const LOCAL_DEMO_SEED_IMAGE_NAME = 'localhost/kravhantering/demo-seed'
export const LOCAL_HSA_DIRECTORY_MOCK_IMAGE_NAME =
  'localhost/kravhantering/hsa-directory-mock'
export const LOCAL_HSA_PERSON_LOOKUP_ADAPTER_IMAGE_NAME =
  'localhost/kravhantering/hsa-person-lookup-adapter'
export const LOCAL_IMAGE_TAG = 'local'
export const LOCAL_APP_IMAGE = `${LOCAL_APP_IMAGE_NAME}:${LOCAL_IMAGE_TAG}`
export const LOCAL_DB_JOB_IMAGE = `${LOCAL_DB_JOB_IMAGE_NAME}:${LOCAL_IMAGE_TAG}`
export const LOCAL_DEMO_SEED_IMAGE = `${LOCAL_DEMO_SEED_IMAGE_NAME}:${LOCAL_IMAGE_TAG}`
export const LOCAL_HSA_DIRECTORY_MOCK_IMAGE = `${LOCAL_HSA_DIRECTORY_MOCK_IMAGE_NAME}:${LOCAL_IMAGE_TAG}`
export const LOCAL_HSA_PERSON_LOOKUP_ADAPTER_IMAGE = `${LOCAL_HSA_PERSON_LOOKUP_ADAPTER_IMAGE_NAME}:${LOCAL_IMAGE_TAG}`
export const RELEASE_SMOKE_HSA_PERSON_LOOKUP_URL =
  'http://kong:8000/hsa/person-records/lookup'
export const RELEASE_SMOKE_HSA_PERSON_LOOKUP_TIMEOUT_MS = '5000'

const ENV_LOCAL_FILES = [
  ['app', 'containers/app/.env.app.local'],
  ['db-job', 'containers/db-job/.env.db-job.local'],
  ['keycloak', 'containers/keycloak/.env.keycloak.local'],
  ['sqlserver', 'containers/sqlserver/.env.sqlserver.local'],
]

const USAGE = `Usage:
  node scripts/containers/run-local-stack.mjs up [--mode <test|release-smoke>] [--run-id <id>] [--skip-build] [--prune-docker-after-load] [--release-images-from-lock]
  node scripts/containers/run-local-stack.mjs down [--mode <test|release-smoke>]

Options:
  --compose-file <path>  Generated Compose file path
  --lock-file <path>     Stack lock file path
  --hsa-integration-lock-file <path>
                         HSA integration support lock file for release-smoke
                         Kong and adapter images
  --network-name <name>   Internal Compose network name
  --prune-docker-after-load
                         Remove Docker build cache and unused images after
                         loading local images into Podman
  --release-images-from-lock
                         Pull project and release-smoke test support images by
                         manifest digest from lock files
  --run-id <id>          Stable run id for ephemeral modes
  --skip-build           Reuse already built Docker images and load them into Podman
  --state-file <path>    Local state file path
  --sqlserver-host-port <value>
  --test-lock-file <path>
                         Test support lock file for release-smoke HSA services
  --tls-dir <path>       Runtime TLS directory
  --mode <test|release-smoke>
                         test and release-smoke use run-specific volumes`

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function parseArgs(args) {
  const [command = '', ...rest] = args
  const options = {}
  let pruneDockerAfterLoad = false
  let releaseImagesFromLock = false
  let skipBuild = false

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)

    if (key === 'skip-build') {
      skipBuild = true
      continue
    }
    if (key === 'release-images-from-lock') {
      releaseImagesFromLock = true
      continue
    }
    if (key === 'prune-docker-after-load') {
      pruneDockerAfterLoad = true
      continue
    }

    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}.`)
    }
    options[key] = value
    index += 1
  }

  const mode = readNonEmpty(options.mode) ?? 'test'
  if (!['test', 'release-smoke'].includes(mode)) {
    throw new Error(`Unsupported local stack mode: ${mode}`)
  }

  return {
    command,
    composeFile: readNonEmpty(options['compose-file']) ?? DEFAULT_COMPOSE_FILE,
    lockFile: readNonEmpty(options['lock-file']) ?? DEFAULT_LOCK_FILE,
    hsaIntegrationSupportLockFile:
      readNonEmpty(options['hsa-integration-lock-file']) ??
      DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_FILE,
    mode,
    networkName:
      readNonEmpty(options['network-name']) ?? DEFAULT_INTERNAL_NETWORK_NAME,
    pruneDockerAfterLoad,
    releaseImagesFromLock,
    runId: readNonEmpty(options['run-id']),
    skipBuild,
    sqlServerHostPort: readNonEmpty(options['sqlserver-host-port']),
    stateFile: readNonEmpty(options['state-file']) ?? DEFAULT_STATE_FILE,
    testSupportLockFile:
      readNonEmpty(options['test-lock-file']) ?? DEFAULT_TEST_SUPPORT_LOCK_FILE,
    tlsDir: readNonEmpty(options['tls-dir']) ?? DEFAULT_TLS_DIR,
  }
}

function readEnvImageConfig(env, prefix, defaults) {
  return {
    image: readNonEmpty(env[`${prefix}_IMAGE`]) ?? defaults.image,
    source: readNonEmpty(env[`${prefix}_SOURCE`]) ?? defaults.source,
    tag: readNonEmpty(env[`${prefix}_TAG`]) ?? defaults.tag,
  }
}

function imageReference(image) {
  return `${image.image}:${image.tag}`
}

function imageManifestDigestReference(image) {
  return `${image.image}@${image.manifestDigest}`
}

export function createLocalStackConfig(options = {}) {
  const mode = options.mode ?? 'test'
  const env =
    options.skipBuild || options.releaseImagesFromLock
      ? (options.env ?? process.env)
      : {}
  const runId =
    options.runId ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const suffix = `${mode}-${runId}`
  const projectName = `kravhantering-container-stack-${suffix}`
  const sqlServerHostPort =
    options.sqlServerHostPort ??
    (mode === 'release-smoke'
      ? DEFAULT_RELEASE_SMOKE_SQLSERVER_HOST_PORT
      : DEFAULT_TEST_SQLSERVER_HOST_PORT)
  const appRuntimeImage = readEnvImageConfig(env, 'APP_RUNTIME', {
    image: LOCAL_APP_IMAGE_NAME,
    source: 'local-build',
    tag: LOCAL_IMAGE_TAG,
  })
  const dbJobImage = readEnvImageConfig(env, 'DB_JOB', {
    image: LOCAL_DB_JOB_IMAGE_NAME,
    source: 'local-build',
    tag: LOCAL_IMAGE_TAG,
  })
  const demoSeedImage = readEnvImageConfig(env, 'DEMO_SEED', {
    image: LOCAL_DEMO_SEED_IMAGE_NAME,
    source: 'local-build',
    tag: LOCAL_IMAGE_TAG,
  })
  const explicitDemoSeedImageReference =
    readNonEmpty(env.DEMO_SEED_MANIFEST_DIGEST_REF) ??
    readNonEmpty(env.DEMO_SEED_IMAGE_REF)
  const demoSeedImageReference =
    explicitDemoSeedImageReference ?? imageReference(demoSeedImage)
  if (
    mode === 'release-smoke' &&
    options.releaseImagesFromLock &&
    !explicitDemoSeedImageReference
  ) {
    throw new Error(
      'Release-smoke lock mode requires DEMO_SEED_MANIFEST_DIGEST_REF or DEMO_SEED_IMAGE_REF. Configure a demo-seed image reference before using --release-images-from-lock.',
    )
  }
  const hsaDirectoryMockImage = readEnvImageConfig(env, 'HSA_DIRECTORY_MOCK', {
    image: LOCAL_HSA_DIRECTORY_MOCK_IMAGE_NAME,
    source: 'local-build',
    tag: LOCAL_IMAGE_TAG,
  })
  const hsaPersonLookupAdapterImage = readEnvImageConfig(
    env,
    'HSA_PERSON_LOOKUP_ADAPTER',
    {
      image: LOCAL_HSA_PERSON_LOOKUP_ADAPTER_IMAGE_NAME,
      source: 'local-build',
      tag: LOCAL_IMAGE_TAG,
    },
  )

  return {
    appRuntimeImage,
    appRuntimeImageReference: imageReference(appRuntimeImage),
    composeFile: options.composeFile ?? DEFAULT_COMPOSE_FILE,
    dbJobImage,
    dbJobImageReference: imageReference(dbJobImage),
    demoSeedImage,
    demoSeedImageReference,
    hsaDirectoryMockImage,
    hsaDirectoryMockImageReference: imageReference(hsaDirectoryMockImage),
    hsaIntegrationSupportLockFile:
      options.hsaIntegrationSupportLockFile ??
      DEFAULT_HSA_INTEGRATION_SUPPORT_LOCK_FILE,
    hsaMtlsVolumeName: `${projectName}-hsa-mtls-certs`,
    hsaPersonLookupAdapterImage,
    hsaPersonLookupAdapterImageReference: imageReference(
      hsaPersonLookupAdapterImage,
    ),
    lockFile: options.lockFile ?? DEFAULT_LOCK_FILE,
    mode,
    networkName:
      readNonEmpty(options.networkName) ?? DEFAULT_INTERNAL_NETWORK_NAME,
    projectName,
    pruneDockerAfterLoad: options.pruneDockerAfterLoad ?? false,
    releaseImagesFromLock: options.releaseImagesFromLock ?? false,
    runId,
    skipBuild: options.skipBuild ?? false,
    sqlServerHostPort,
    sqlServerVolumeName: `${projectName}-sqlserver-data`,
    stateFile: options.stateFile ?? DEFAULT_STATE_FILE,
    testSupportLockFile:
      options.testSupportLockFile ?? DEFAULT_TEST_SUPPORT_LOCK_FILE,
    tlsDir: options.tlsDir ?? DEFAULT_TLS_DIR,
  }
}

export function podmanComposeArgs(config, args) {
  return [
    'compose',
    '-f',
    config.composeFile,
    '--project-name',
    config.projectName,
    ...args,
  ]
}

export function podmanComposeNetworkName(config) {
  return readNonEmpty(config.networkName) ?? DEFAULT_INTERNAL_NETWORK_NAME
}

function runCommand(command, args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      PODMAN_COMPOSE_PROVIDER:
        process.env.PODMAN_COMPOSE_PROVIDER ?? DEFAULT_PODMAN_COMPOSE_PROVIDER,
      STORAGE_DRIVER:
        process.env.STORAGE_DRIVER ?? DEFAULT_PODMAN_STORAGE_DRIVER,
      ...options.env,
    },
    stdio: options.stdio ?? 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`)
  }
  return result
}

function execText(command, args, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  return execFileSync(command, args, {
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
  }).trim()
}

function runCommandAllowFailure(command, args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      PODMAN_COMPOSE_PROVIDER:
        process.env.PODMAN_COMPOSE_PROVIDER ?? DEFAULT_PODMAN_COMPOSE_PROVIDER,
      STORAGE_DRIVER:
        process.env.STORAGE_DRIVER ?? DEFAULT_PODMAN_STORAGE_DRIVER,
      ...options.env,
    },
    stdio: options.stdio ?? 'ignore',
  })
}

function splitLines(value) {
  return String(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

export function parseEnvFile(content) {
  const values = {}
  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1)
  }
  return values
}

function readEnvLocal(relativePath, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const filePath = path.resolve(cwd, relativePath)
  return fsImpl.existsSync(filePath)
    ? parseEnvFile(fsImpl.readFileSync(filePath, 'utf8'))
    : {}
}

export function sqlServerWaitPort(sqlServerHostPort) {
  const lastColon = sqlServerHostPort.lastIndexOf(':')
  return lastColon >= 0
    ? sqlServerHostPort.slice(lastColon + 1)
    : sqlServerHostPort
}

function ensureEnvLocalFiles(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  for (const [container, relativePath] of ENV_LOCAL_FILES) {
    if (!fsImpl.existsSync(path.resolve(cwd, relativePath))) {
      runCommand(
        'node',
        ['scripts/containers/write-env-local.mjs', container],
        options,
      )
    }
  }
}

function loadDockerImageIntoPodman(image, options = {}) {
  const spawn = options.spawn ?? childProcess.spawn
  return new Promise((resolve, reject) => {
    const docker = spawn('docker', ['save', image], { cwd: options.cwd })
    const podman = spawn('podman', ['load'], {
      cwd: options.cwd,
      env: {
        ...process.env,
        STORAGE_DRIVER:
          process.env.STORAGE_DRIVER ?? DEFAULT_PODMAN_STORAGE_DRIVER,
        ...options.env,
      },
    })
    docker.stdout.pipe(podman.stdin)
    docker.stderr.pipe(process.stderr)
    podman.stderr.pipe(process.stderr)
    docker.on('error', reject)
    podman.on('error', reject)
    docker.on('close', code => {
      if (code !== 0) {
        reject(new Error(`docker save ${image} failed with ${code}`))
      }
    })
    podman.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`podman load ${image} failed with ${code}`))
    })
  })
}

function pruneDockerAfterLoad(config, options = {}) {
  if (!config.pruneDockerAfterLoad) return
  runCommand('docker', ['buildx', 'prune', '--all', '--force'], options)
  runCommand('docker', ['image', 'prune', '--all', '--force'], options)
}

function inspectImageId(image, options = {}) {
  let id
  try {
    id = execText(
      'podman',
      ['image', 'inspect', image, '--format', '{{.Id}}'],
      options,
    )
  } catch {
    id = execText(
      'docker',
      ['image', 'inspect', image, '--format', '{{.Id}}'],
      options,
    )
  }
  return id.startsWith('sha256:') ? id : `sha256:${id}`
}

function normalizeDigest(value) {
  const digest = readNonEmpty(value)
  if (!digest || digest === '<none>' || digest === '<no value>') {
    return undefined
  }
  const sha = digest.includes('@')
    ? digest.slice(digest.lastIndexOf('@') + 1)
    : digest
  return sha.startsWith('sha256:') ? sha : `sha256:${sha}`
}

function inspectImageDigest(command, image, format, options = {}) {
  return normalizeDigest(
    execText(command, ['image', 'inspect', image, '--format', format], options),
  )
}

function inspectManifestDigest(image, options = {}) {
  for (const command of ['podman', 'docker']) {
    for (const format of ['{{.Digest}}', '{{index .RepoDigests 0}}']) {
      try {
        const digest = inspectImageDigest(command, image, format, options)
        if (digest) return digest
      } catch {
        // Try the next inspect source/format before failing.
      }
    }
  }
  throw new Error(`Unable to inspect manifest digest for ${image}.`)
}

function readStackLock(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const stackLock = JSON.parse(
    fsImpl.readFileSync(path.resolve(cwd, config.lockFile), 'utf8'),
  )
  assertStackLockSchema(stackLock, config.lockFile)
  return stackLock
}

function readTestSupportLock(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lock = JSON.parse(
    fsImpl.readFileSync(path.resolve(cwd, config.testSupportLockFile), 'utf8'),
  )
  assertTestSupportLockSchema(lock, config.testSupportLockFile)
  return lock
}

function readHsaIntegrationSupportLock(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const lock = JSON.parse(
    fsImpl.readFileSync(
      path.resolve(cwd, config.hsaIntegrationSupportLockFile),
      'utf8',
    ),
  )
  assertHsaIntegrationSupportLockSchema(
    lock,
    config.hsaIntegrationSupportLockFile,
  )
  return lock
}

function lockedProjectService(config, serviceName, options = {}) {
  const stackLock = readStackLock(config, options)
  const service = stackLock.services?.find(item => item.name === serviceName)

  if (
    !service?.image ||
    !service.tag ||
    !service.manifestDigest ||
    !service.imageId ||
    !service.source
  ) {
    throw new Error(`Missing ${serviceName} image lock in ${config.lockFile}.`)
  }

  return service
}

function lockedTestSupportService(config, serviceName, options = {}) {
  const testSupportLock = readTestSupportLock(config, options)
  const service = testSupportLock.services?.find(
    item => item.name === serviceName,
  )

  if (
    !service?.image ||
    !service.tag ||
    !service.manifestDigest ||
    !service.imageId ||
    !service.source
  ) {
    throw new Error(
      `Missing ${serviceName} image lock in ${config.testSupportLockFile}.`,
    )
  }

  return service
}

function lockedHsaIntegrationSupportService(config, serviceName, options = {}) {
  const hsaIntegrationSupportLock = readHsaIntegrationSupportLock(
    config,
    options,
  )
  const service = hsaIntegrationSupportLock.services?.find(
    item => item.name === serviceName,
  )

  if (
    !service?.image ||
    !service.tag ||
    !service.manifestDigest ||
    !service.imageId ||
    !service.source
  ) {
    throw new Error(
      `Missing ${serviceName} image lock in ${config.hsaIntegrationSupportLockFile}.`,
    )
  }

  return service
}

function withReleaseImagesFromLock(config, options = {}) {
  if (!config.releaseImagesFromLock) return config

  const appRuntimeImage = lockedProjectService(config, 'app-runtime', options)
  const dbJobImage = lockedProjectService(config, 'db-job', options)
  const hsaDirectoryMockImage =
    config.mode === 'release-smoke'
      ? lockedTestSupportService(config, 'hsa-directory-mock', options)
      : undefined
  const hsaPersonLookupAdapterImage =
    config.mode === 'release-smoke'
      ? lockedHsaIntegrationSupportService(
          config,
          'hsa-person-lookup-adapter',
          options,
        )
      : undefined

  return {
    ...config,
    appRuntimeImage,
    appRuntimeImageReference: imageManifestDigestReference(appRuntimeImage),
    dbJobImage,
    dbJobImageReference: imageManifestDigestReference(dbJobImage),
    ...(hsaDirectoryMockImage
      ? {
          hsaDirectoryMockImage,
          hsaDirectoryMockImageReference: imageManifestDigestReference(
            hsaDirectoryMockImage,
          ),
        }
      : {}),
    ...(hsaPersonLookupAdapterImage
      ? {
          hsaPersonLookupAdapterImage,
          hsaPersonLookupAdapterImageReference: imageManifestDigestReference(
            hsaPersonLookupAdapterImage,
          ),
        }
      : {}),
  }
}

function writeState(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const statePath = path.resolve(cwd, config.stateFile)
  fsImpl.mkdirSync(path.dirname(statePath), { recursive: true })
  fsImpl.writeFileSync(statePath, `${JSON.stringify(config, null, 2)}\n`)
}

function readState(stateFile, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const statePath = path.resolve(cwd, stateFile)
  return fsImpl.existsSync(statePath)
    ? JSON.parse(fsImpl.readFileSync(statePath, 'utf8'))
    : null
}

function waitEnv(config, options = {}) {
  const sqlServerEnv = readEnvLocal(
    'containers/sqlserver/.env.sqlserver.local',
    options,
  )
  return {
    ...process.env,
    ...sqlServerEnv,
    DB_HOST: '127.0.0.1',
    DB_NAME: 'master',
    DB_PASSWORD: sqlServerEnv.MSSQL_SA_PASSWORD,
    DB_PORT: sqlServerWaitPort(config.sqlServerHostPort),
    DB_USER: 'sa',
    NODE_EXTRA_CA_CERTS: path.join(config.tlsDir, 'ca.crt'),
  }
}

function runWait(target, config, options = {}) {
  runCommand(
    'node',
    [
      'scripts/containers/wait-for.mjs',
      target,
      '--resolve-host-to',
      '127.0.0.1',
    ],
    {
      ...options,
      env: waitEnv(config, options),
    },
  )
}

function dbJobEnvFilePath(options = {}) {
  return path.resolve(
    options.cwd ?? process.cwd(),
    'containers/db-job/.env.db-job.local',
  )
}

function appEnvFilePath(options = {}) {
  return path.resolve(
    options.cwd ?? process.cwd(),
    'containers/app/.env.app.local',
  )
}

function containerName(config, service) {
  return `${config.projectName}_${service}_1`
}

function projectNameFromContainerName(name) {
  const match = String(name).match(
    /^(kravhantering-container-stack-(?:test|release-smoke)-[^_]+)_(?:app-runtime|db-bootstrap|db-migrate|db-seed-demo|db-seed-required|hsa-directory-mock|hsa-mtls-cert-generator|hsa-person-lookup-adapter|keycloak|kong|nginx|sqlserver)_\d+$/u,
  )
  return match?.[1] ?? null
}

function isEphemeralMode(mode) {
  return ['test', 'release-smoke'].includes(mode)
}

export function parseLocalTestProjectsFromPs(psText, currentProjectName) {
  const projects = new Set()

  for (const line of splitLines(psText)) {
    const [name = ''] = line.split('\t')
    const projectName = projectNameFromContainerName(name)
    if (projectName && projectName !== currentProjectName) {
      projects.add(projectName)
    }
  }

  return [...projects].sort()
}

function removeLocalStackProject(projectName, config, options = {}) {
  const containers = splitLines(
    execText(
      'podman',
      [
        'ps',
        '--all',
        '--filter',
        `label=io.podman.compose.project=${projectName}`,
        '--format',
        '{{.Names}}',
      ],
      options,
    ),
  )

  for (const name of containers) {
    runCommandAllowFailure('podman', ['stop', '--time', '10', name], options)
  }
  for (const name of containers) {
    runCommandAllowFailure('podman', ['rm', name], options)
  }

  if (isEphemeralMode(config.mode)) {
    const volumes = splitLines(
      execText(
        'podman',
        [
          'volume',
          'ls',
          '--noheading',
          '--filter',
          `label=io.podman.compose.project=${projectName}`,
          '--format',
          '{{.Name}}',
        ],
        options,
      ),
    )

    for (const name of volumes) {
      runCommandAllowFailure('podman', ['volume', 'rm', name], options)
    }
  }
}

export function cleanupConflictingTestStacks(config, options = {}) {
  if (!isEphemeralMode(config.mode)) {
    return []
  }

  const psText = execText(
    'podman',
    ['ps', '--all', '--format', '{{.Names}}\t{{.Ports}}'],
    options,
  )
  const projects = parseLocalTestProjectsFromPs(psText, config.projectName)

  for (const projectName of projects) {
    removeLocalStackProject(projectName, config, options)
  }

  return projects
}

function assertContainerRunning(config, service, options = {}) {
  const name = containerName(config, service)
  const running = execText(
    'podman',
    ['inspect', '--format', '{{.State.Running}}', name],
    options,
  )

  if (running !== 'true') {
    throw new Error(
      `${service} container for ${config.projectName} is not running. Stop the local stack and check whether required host ports are already in use.`,
    )
  }
}

function lockedVendorImageReference(config, serviceName, options = {}) {
  const stackLock = readStackLock(config, options)
  const service = stackLock.services?.find(item => item.name === serviceName)

  if (!service?.image || !service.manifestDigest) {
    throw new Error(`Missing ${serviceName} image lock in ${config.lockFile}.`)
  }

  return `${service.image}@${service.manifestDigest}`
}

function lockedHsaIntegrationSupportImageReference(
  config,
  serviceName,
  options = {},
) {
  const hsaIntegrationSupportLock = readHsaIntegrationSupportLock(
    config,
    options,
  )
  const service = hsaIntegrationSupportLock.services?.find(
    item => item.name === serviceName,
  )

  if (!service?.image || !service.manifestDigest) {
    throw new Error(
      `Missing ${serviceName} image lock in ${config.hsaIntegrationSupportLockFile}.`,
    )
  }

  return `${service.image}@${service.manifestDigest}`
}

function lockedImageLockReference(relativePath, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const service = JSON.parse(
    fsImpl.readFileSync(path.resolve(cwd, relativePath), 'utf8'),
  )
  if (!service?.image || !service.manifestDigest) {
    throw new Error(`${relativePath} is missing image or manifestDigest.`)
  }
  return `${service.image}@${service.manifestDigest}`
}

function pullReleaseProjectImages(config, options = {}) {
  for (const imageRef of [
    config.appRuntimeImageReference,
    config.dbJobImageReference,
    ...(config.mode === 'release-smoke' ? [config.demoSeedImageReference] : []),
  ]) {
    runCommand('podman', ['pull', imageRef], options)
  }
}

function pullReleaseTestSupportImages(config, options = {}) {
  if (config.mode !== 'release-smoke') return
  for (const imageRef of [
    lockedHsaIntegrationSupportImageReference(config, 'kong', options),
    config.hsaPersonLookupAdapterImageReference,
    config.hsaDirectoryMockImageReference,
  ]) {
    runCommand('podman', ['pull', imageRef], options)
  }
}

function podmanLabelArgs(config, service) {
  return [
    '--label',
    `io.podman.compose.project=${config.projectName}`,
    '--label',
    `com.docker.compose.project=${config.projectName}`,
    '--label',
    `com.docker.compose.service=${service}`,
  ]
}

function runDatabaseJob(service, config, options = {}) {
  const commands = {
    'db-bootstrap': 'bootstrap',
    'db-migrate': 'migrate',
    'db-seed-demo': 'seed:demo',
    'db-seed-required': 'seed:required',
  }
  const jobImageReference =
    service === 'db-seed-demo'
      ? config.demoSeedImageReference
      : config.dbJobImageReference

  runCommand(
    'podman',
    [
      'run',
      '--rm',
      '--pull=never',
      '--env-file',
      dbJobEnvFilePath(options),
      '--net',
      podmanComposeNetworkName(config),
      '--network-alias',
      service,
      ...podmanLabelArgs(config, service),
      jobImageReference,
      commands[service],
    ],
    options,
  )
}

function runAppRuntime(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const releaseSmokeHsaEnv =
    config.mode === 'release-smoke'
      ? [
          '--env',
          `HSA_PERSON_LOOKUP_URL=${RELEASE_SMOKE_HSA_PERSON_LOOKUP_URL}`,
          '--env',
          `HSA_PERSON_LOOKUP_TIMEOUT_MS=${RELEASE_SMOKE_HSA_PERSON_LOOKUP_TIMEOUT_MS}`,
        ]
      : []
  runCommand(
    'podman',
    [
      'run',
      '--name',
      containerName(config, 'app-runtime'),
      '--detach',
      '--no-hosts',
      '--pull=never',
      '--env-file',
      appEnvFilePath(options),
      '--env',
      'NODE_EXTRA_CA_CERTS=/run/kravhantering/tls/ca.crt',
      ...releaseSmokeHsaEnv,
      '--volume',
      `${path.resolve(cwd, config.tlsDir, 'ca.crt')}:/run/kravhantering/tls/ca.crt:ro`,
      '--net',
      podmanComposeNetworkName(config),
      '--network-alias',
      'app-runtime',
      ...podmanLabelArgs(config, 'app-runtime'),
      config.appRuntimeImageReference,
    ],
    options,
  )
}

function runNginx(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  runCommand(
    'podman',
    [
      'run',
      '--name',
      containerName(config, 'nginx'),
      '--detach',
      '--volume',
      `${path.resolve(cwd, 'containers/nginx/nginx.conf')}:/etc/nginx/nginx.conf:ro`,
      '--volume',
      `${path.resolve(cwd, 'containers/nginx/conf.d')}:/etc/nginx/conf.d:ro`,
      '--volume',
      `${path.resolve(cwd, config.tlsDir, 'kravhantering.test.crt')}:/etc/nginx/tls/kravhantering.test.crt:ro`,
      '--volume',
      `${path.resolve(cwd, config.tlsDir, 'kravhantering.test.key')}:/etc/nginx/tls/kravhantering.test.key:ro`,
      '--net',
      podmanComposeNetworkName(config),
      '--network-alias',
      'nginx',
      '--network-alias',
      'kravhantering.test',
      '--publish',
      '443:443',
      ...podmanLabelArgs(config, 'nginx'),
      lockedVendorImageReference(config, 'nginx', options),
    ],
    options,
  )
}

function runHsaDirectoryMock(config, options = {}) {
  runCommand(
    'podman',
    [
      'run',
      '--name',
      containerName(config, 'hsa-directory-mock'),
      '--detach',
      '--env',
      'PORT=8443',
      '--volume',
      `${config.hsaMtlsVolumeName}:/run/hsa-mtls:ro`,
      '--net',
      podmanComposeNetworkName(config),
      '--network-alias',
      'hsa-directory-mock',
      ...podmanLabelArgs(config, 'hsa-directory-mock'),
      config.hsaDirectoryMockImageReference,
    ],
    options,
  )
}

function runHsaMtlsCertGenerator(config, options = {}) {
  runCommand(
    'podman',
    [
      'volume',
      'create',
      '--label',
      `io.podman.compose.project=${config.projectName}`,
      config.hsaMtlsVolumeName,
    ],
    options,
  )
  runCommand(
    'podman',
    [
      'run',
      '--rm',
      '--pull=never',
      '--user',
      '0:0',
      '--name',
      containerName(config, 'hsa-mtls-cert-generator'),
      '--volume',
      `${config.hsaMtlsVolumeName}:/run/hsa-mtls`,
      '--net',
      podmanComposeNetworkName(config),
      ...podmanLabelArgs(config, 'hsa-mtls-cert-generator'),
      config.hsaPersonLookupAdapterImageReference,
      'npm',
      'run',
      'generate-certs',
    ],
    options,
  )
}

function runHsaPersonLookupAdapter(config, options = {}) {
  runCommand(
    'podman',
    [
      'run',
      '--name',
      containerName(config, 'hsa-person-lookup-adapter'),
      '--detach',
      '--pull=never',
      '--env',
      'PORT=8080',
      '--env',
      'HSA_SOAP_ENDPOINT_URL=https://hsa-directory-mock:8443/svr-hsaws2/hsaws',
      '--env',
      'HSA_SOAP_TIMEOUT_MS=5000',
      '--volume',
      `${config.hsaMtlsVolumeName}:/run/hsa-mtls:ro`,
      '--net',
      podmanComposeNetworkName(config),
      '--network-alias',
      'hsa-person-lookup-adapter',
      ...podmanLabelArgs(config, 'hsa-person-lookup-adapter'),
      config.hsaPersonLookupAdapterImageReference,
    ],
    options,
  )
}

function runKong(config, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const kongImageReference = config.releaseImagesFromLock
    ? lockedHsaIntegrationSupportImageReference(config, 'kong', options)
    : lockedImageLockReference('containers/kong/image.lock.json', options)
  runCommand(
    'podman',
    [
      'run',
      '--name',
      containerName(config, 'kong'),
      '--detach',
      '--env',
      'KONG_ADMIN_ACCESS_LOG=/dev/stdout',
      '--env',
      'KONG_ADMIN_ERROR_LOG=/dev/stderr',
      '--env',
      'KONG_ADMIN_LISTEN=0.0.0.0:8001',
      '--env',
      'KONG_DATABASE=off',
      '--env',
      'KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml',
      '--env',
      'KONG_PROXY_ACCESS_LOG=/dev/stdout',
      '--env',
      'KONG_PROXY_ERROR_LOG=/dev/stderr',
      '--env',
      'KONG_PROXY_LISTEN=0.0.0.0:8000',
      '--volume',
      `${path.resolve(cwd, 'containers/kong/kong.yml')}:/kong/declarative/kong.yml:ro`,
      '--net',
      podmanComposeNetworkName(config),
      '--network-alias',
      'kong',
      ...podmanLabelArgs(config, 'kong'),
      kongImageReference,
    ],
    options,
  )
}

async function up(config, options = {}) {
  const runtimeConfig = withReleaseImagesFromLock(config, options)
  runCommand('podman', ['--version'], options)
  runCommand('podman', ['compose', 'version'], options)
  runCommand('podman', ['info'], options)
  const cleanedProjects = cleanupConflictingTestStacks(runtimeConfig, options)
  const consoleObj = options.consoleObj ?? console
  for (const projectName of cleanedProjects) {
    consoleObj.log(`Removed previous local ephemeral stack (${projectName}).`)
  }
  ensureEnvLocalFiles(options)
  runCommand(
    'node',
    [
      'scripts/containers/generate-tls.mjs',
      '--output-dir',
      runtimeConfig.tlsDir,
    ],
    options,
  )
  if (!runtimeConfig.releaseImagesFromLock && !runtimeConfig.skipBuild) {
    runCommand('npm', ['run', 'container:build:app-runtime'], options)
    runCommand('npm', ['run', 'container:build:db-job'], options)
    if (runtimeConfig.mode === 'release-smoke') {
      runCommand('npm', ['run', 'container:build:demo-seed'], options)
      runCommand('npm', ['run', 'container:build:hsa-directory-mock'], options)
      runCommand(
        'npm',
        ['run', 'container:build:hsa-person-lookup-adapter'],
        options,
      )
    }
  }
  if (runtimeConfig.releaseImagesFromLock) {
    pullReleaseProjectImages(runtimeConfig, options)
    pullReleaseTestSupportImages(runtimeConfig, options)
  } else {
    await loadDockerImageIntoPodman(
      runtimeConfig.appRuntimeImageReference,
      options,
    )
    await loadDockerImageIntoPodman(runtimeConfig.dbJobImageReference, options)
    if (runtimeConfig.mode === 'release-smoke') {
      await loadDockerImageIntoPodman(
        runtimeConfig.demoSeedImageReference,
        options,
      )
      await loadDockerImageIntoPodman(
        runtimeConfig.hsaDirectoryMockImageReference,
        options,
      )
      await loadDockerImageIntoPodman(
        runtimeConfig.hsaPersonLookupAdapterImageReference,
        options,
      )
    }

    const appImageId = inspectImageId(
      runtimeConfig.appRuntimeImageReference,
      options,
    )
    const appManifestDigest = inspectManifestDigest(
      runtimeConfig.appRuntimeImageReference,
      options,
    )
    const dbJobImageId = inspectImageId(
      runtimeConfig.dbJobImageReference,
      options,
    )
    const dbJobManifestDigest = inspectManifestDigest(
      runtimeConfig.dbJobImageReference,
      options,
    )
    const hsaPersonLookupAdapterImageId =
      runtimeConfig.mode === 'release-smoke'
        ? inspectImageId(
            runtimeConfig.hsaPersonLookupAdapterImageReference,
            options,
          )
        : null
    const hsaPersonLookupAdapterManifestDigest =
      runtimeConfig.mode === 'release-smoke'
        ? inspectManifestDigest(
            runtimeConfig.hsaPersonLookupAdapterImageReference,
            options,
          )
        : null
    runCommand(
      'node',
      [
        'scripts/containers/generate-stack-lock.mjs',
        'generate',
        '--lock-file',
        runtimeConfig.lockFile,
        '--app-image',
        runtimeConfig.appRuntimeImage.image,
        '--app-tag',
        runtimeConfig.appRuntimeImage.tag,
        '--app-manifest-digest',
        appManifestDigest,
        '--app-image-id',
        appImageId,
        '--app-source',
        runtimeConfig.appRuntimeImage.source,
        '--db-job-image',
        runtimeConfig.dbJobImage.image,
        '--db-job-tag',
        runtimeConfig.dbJobImage.tag,
        '--db-job-manifest-digest',
        dbJobManifestDigest,
        '--db-job-image-id',
        dbJobImageId,
        '--db-job-source',
        runtimeConfig.dbJobImage.source,
      ],
      options,
    )
    if (runtimeConfig.mode === 'release-smoke') {
      runCommand(
        'node',
        [
          'scripts/containers/generate-hsa-integration-support-lock.mjs',
          'generate',
          '--lock-file',
          runtimeConfig.hsaIntegrationSupportLockFile,
          '--hsa-person-lookup-adapter-image',
          runtimeConfig.hsaPersonLookupAdapterImage.image,
          '--hsa-person-lookup-adapter-tag',
          runtimeConfig.hsaPersonLookupAdapterImage.tag,
          '--hsa-person-lookup-adapter-manifest-digest',
          hsaPersonLookupAdapterManifestDigest,
          '--hsa-person-lookup-adapter-image-id',
          hsaPersonLookupAdapterImageId,
          '--hsa-person-lookup-adapter-source',
          runtimeConfig.hsaPersonLookupAdapterImage.source,
        ],
        options,
      )
    }
    pruneDockerAfterLoad(runtimeConfig, options)
  }
  runCommand(
    'node',
    [
      'scripts/containers/generate-compose.mjs',
      '--mode',
      runtimeConfig.releaseImagesFromLock ? 'release' : 'pr',
      '--lock-file',
      runtimeConfig.lockFile,
      '--network-name',
      runtimeConfig.networkName,
      '--project-name',
      runtimeConfig.projectName,
      '--sqlserver-volume-name',
      runtimeConfig.sqlServerVolumeName,
      '--sqlserver-host-port',
      runtimeConfig.sqlServerHostPort,
      '--demo-seed-image',
      runtimeConfig.demoSeedImageReference,
      '--tls-dir',
      runtimeConfig.tlsDir,
    ],
    options,
  )

  writeState(runtimeConfig, options)
  runCommand(
    'podman',
    podmanComposeArgs(runtimeConfig, ['up', '-d', 'sqlserver', 'keycloak']),
    options,
  )
  assertContainerRunning(runtimeConfig, 'sqlserver', options)
  runWait('sqlserver', runtimeConfig, options)

  for (const service of ['db-bootstrap', 'db-migrate', 'db-seed-required']) {
    runDatabaseJob(service, runtimeConfig, options)
  }
  if (runtimeConfig.mode === 'release-smoke') {
    runDatabaseJob('db-seed-demo', runtimeConfig, options)
    runHsaMtlsCertGenerator(runtimeConfig, options)
    runHsaDirectoryMock(runtimeConfig, options)
    runHsaPersonLookupAdapter(runtimeConfig, options)
    runKong(runtimeConfig, options)
  }

  runAppRuntime(runtimeConfig, options)
  runNginx(runtimeConfig, options)
  runWait('nginx', runtimeConfig, options)
  runWait('keycloak', runtimeConfig, options)
  runWait('health', runtimeConfig, options)
  runWait('ready', runtimeConfig, options)
  runCommand(
    'node',
    [
      'scripts/containers/collect-status.mjs',
      '--compose-file',
      runtimeConfig.composeFile,
      '--project-name',
      runtimeConfig.projectName,
    ],
    options,
  )
  runCommand('node', ['scripts/containers/write-hashes.mjs'], options)
}

function down(config, options = {}) {
  runCommand(
    'node',
    [
      'scripts/containers/collect-status.mjs',
      '--compose-file',
      config.composeFile,
      '--project-name',
      config.projectName,
    ],
    options,
  )
  runCommand('node', ['scripts/containers/write-hashes.mjs'], options)
  runCommand(
    'podman',
    podmanComposeArgs(config, [
      'down',
      '--remove-orphans',
      ...(isEphemeralMode(config.mode) ? ['--volumes'] : []),
    ]),
    options,
  )
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  try {
    const parsed = parseArgs(args)
    if (!['up', 'down'].includes(parsed.command)) {
      consoleObj.error(USAGE)
      return 1
    }
    const savedState = readState(parsed.stateFile, dependencies)
    const config =
      parsed.command === 'down' && savedState
        ? savedState
        : createLocalStackConfig({
            ...parsed,
            env: dependencies.env ?? process.env,
          })

    if (parsed.command === 'up') {
      await up(config, dependencies)
      consoleObj.log(`Local container stack is ready (${config.projectName}).`)
    } else {
      down(config, dependencies)
      consoleObj.log(`Local container stack stopped (${config.projectName}).`)
    }
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
