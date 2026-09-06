#!/usr/bin/env node

import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareProductionSmokeBundle } from './prepare-production-smoke-bundle.mjs'
import {
  buildSmokeEnvironment,
  DEBUG_CONTAINER_LABEL,
  DEBUG_CONTAINER_LABEL_VALUE,
  DEBUG_CONTAINER_NAME,
  parseDebugArgs,
  parseOciImageMetadata,
  selectOciManifest,
  selectRunArtifacts,
  validateDownloadedArtifactCache,
} from './production-smoke-debug-contract.mjs'

const USAGE = `Usage:
  npm run container:production-smoke:debug -- run --run-id <github-run-id> [--repo <owner/repository>]
  npm run container:production-smoke:debug -- shell
  npm run container:production-smoke:debug -- evidence
  npm run container:production-smoke:debug -- down`

const DEBUG_IMAGE = 'kravhantering-production-smoke-debug:ubuntu-24.04'
const DEBUG_CACHE_ROOT = path.resolve('tmp', 'production-smoke-debug', '.cache')
const CONTAINERFILE = 'scripts/containers/production-smoke-debug.Containerfile'
const OCI_ARCHIVES = {
  'app-runtime': 'app-runtime.oci.tar',
  'db-job': 'db-job.oci.tar',
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: options.capture ? 'utf8' : undefined,
    env: {
      ...process.env,
      DOCKER_CONFIG: path.join(DEBUG_CACHE_ROOT, 'docker'),
      XDG_CACHE_HOME: DEBUG_CACHE_ROOT,
      ...options.env,
    },
    input: options.input,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture
      ? `: ${(result.stderr || result.stdout).trim()}`
      : ''
    throw new Error(`${command} exited with status ${result.status}${detail}`)
  }
  return result
}

function capture(command, args) {
  return run(command, args, { capture: true }).stdout.trim()
}

function requireCommand(command) {
  run('sh', ['-c', 'command -v "$1" >/dev/null', 'sh', command], {
    capture: true,
  })
}

function prepareLocalEnvironmentFiles() {
  const files = {
    app: 'containers/app/.env.app.local',
    'db-job': 'containers/db-job/.env.db-job.local',
    keycloak: 'containers/keycloak/.env.keycloak.local',
    sqlserver: 'containers/sqlserver/.env.sqlserver.local',
  }
  for (const [container, filePath] of Object.entries(files)) {
    if (!fs.existsSync(filePath)) {
      run('node', ['scripts/containers/write-env-local.mjs', container])
    }
  }
}

function containerExists() {
  return (
    run('docker', ['container', 'inspect', DEBUG_CONTAINER_NAME], {
      allowFailure: true,
      capture: true,
    }).status === 0
  )
}

function ownedContainerRunId() {
  const ownership = capture('docker', [
    'container',
    'inspect',
    '--format',
    `{{ index .Config.Labels "${DEBUG_CONTAINER_LABEL}" }}`,
    DEBUG_CONTAINER_NAME,
  ])
  if (ownership !== DEBUG_CONTAINER_LABEL_VALUE) {
    throw new Error(
      `Refusing to operate on ${DEBUG_CONTAINER_NAME}: ownership label is missing.`,
    )
  }
  return capture('docker', [
    'container',
    'inspect',
    '--format',
    '{{ index .Config.Labels "io.viscalyx.kravhantering.github-run-id" }}',
    DEBUG_CONTAINER_NAME,
  ])
}

function runRoot(runId) {
  return path.resolve('tmp', 'production-smoke-debug', runId)
}

function downloadArtifact(repository, runId, artifactName, outputDirectory) {
  if (
    fs.existsSync(outputDirectory) &&
    fs.readdirSync(outputDirectory).length
  ) {
    return
  }
  fs.mkdirSync(outputDirectory, { recursive: true })
  run('gh', [
    'run',
    'download',
    runId,
    '--repo',
    repository,
    '--name',
    artifactName,
    '--dir',
    outputDirectory,
  ])
}

function downloadRunArtifacts({ repository, runId }) {
  const response = JSON.parse(
    capture('gh', [
      'api',
      `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
    ]),
  )
  const artifacts = selectRunArtifacts(response.artifacts ?? [], runId)
  const root = runRoot(runId)
  const ociDirectory = path.join(root, 'artifacts', 'oci')
  const runtimeDirectory = path.join(root, 'artifacts', 'runtime')
  for (const candidate of Object.keys(OCI_ARCHIVES)) {
    downloadArtifact(
      repository,
      runId,
      artifacts[candidate],
      path.join(ociDirectory, candidate),
    )
  }
  downloadArtifact(repository, runId, artifacts.runtime, runtimeDirectory)

  const requiredPaths = [
    ...Object.entries(OCI_ARCHIVES).map(([name, file]) =>
      path.join(ociDirectory, name, file),
    ),
    path.join(ociDirectory, 'app-runtime', 'build.json'),
    path.join(runtimeDirectory, 'container-stack.lock.json'),
  ]
  validateDownloadedArtifactCache({
    artifactRoot: path.join(root, 'artifacts'),
    fsImpl: fs,
    requiredPaths,
  })
  return { ociDirectory, root, runtimeDirectory }
}

function readArchiveJson(archivePath, archiveEntry) {
  return JSON.parse(capture('tar', ['-xOf', archivePath, archiveEntry]))
}

function readOciMetadata(archivePath) {
  const index = readArchiveJson(archivePath, 'index.json')
  const descriptor = selectOciManifest(index)
  const manifest = readArchiveJson(
    archivePath,
    `blobs/sha256/${descriptor.digest.slice('sha256:'.length)}`,
  )
  return parseOciImageMetadata(index, manifest)
}

function prepareInputs(downloads, runId) {
  const buildPath = path.join(
    downloads.ociDirectory,
    'app-runtime',
    'build.json',
  )
  const stackLockPath = path.join(
    downloads.runtimeDirectory,
    'container-stack.lock.json',
  )
  const build = JSON.parse(fs.readFileSync(buildPath, 'utf8'))
  const stackLock = JSON.parse(fs.readFileSync(stackLockPath, 'utf8'))
  const imageArchives = {}
  const imageMetadata = {}
  for (const [name, file] of Object.entries(OCI_ARCHIVES)) {
    const archivePath = path.join(downloads.ociDirectory, name, file)
    imageArchives[name] = archivePath
    imageMetadata[name] = readOciMetadata(archivePath)
  }

  const app = imageMetadata['app-runtime']
  const database = imageMetadata['db-job']
  const outputDirectory = path.join(downloads.root, 'deployment')
  fs.rmSync(outputDirectory, { force: true, recursive: true })
  const bundle = prepareProductionSmokeBundle(
    {
      version: build.version,
      'commit-sha': build.commitSha,
      'run-id': runId,
      'app-ref': app.reference,
      'app-image-id': app.imageId,
      'app-manifest-digest': app.descriptor.digest,
      'db-job-ref': database.reference,
      'db-job-image-id': database.imageId,
      'db-job-manifest-digest': database.descriptor.digest,
      'stack-lock': stackLockPath,
      'output-dir': outputDirectory,
    },
    { buildJsonPath: buildPath },
  )
  const evidenceDirectory = path.join(downloads.root, 'evidence')
  return {
    archivePath: bundle.archivePath,
    environment: {
      BUILD_COMMIT_SHA: build.commitSha,
      BUILD_VERSION: build.version,
      BUILD_IMAGE_TAG: build.imageTag,
      ...buildSmokeEnvironment({
        evidenceDirectory,
        imageArchives,
        imageMetadata,
        runId,
        stackLock,
      }),
    },
  }
}

function dockerExec(args, options = {}) {
  const environmentArgs = Object.entries(options.environment ?? {}).flatMap(
    ([key, value]) => ['--env', `${key}=${value}`],
  )
  return run(
    'docker',
    [
      'exec',
      ...environmentArgs,
      '--workdir',
      '/workspace',
      DEBUG_CONTAINER_NAME,
      ...args,
    ],
    { allowFailure: options.allowFailure },
  )
}

export function waitForSystemd(options = {}) {
  const runCommand = options.runCommand ?? run
  const waitAfterFailure =
    options.waitAfterFailure ?? (() => run('sleep', ['1'], { capture: true }))
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = runCommand(
      'docker',
      [
        'exec',
        DEBUG_CONTAINER_NAME,
        'systemctl',
        'is-system-running',
        '--wait',
      ],
      { allowFailure: true, capture: true },
    )
    if (['running', 'degraded'].includes(result.stdout.trim())) return
    waitAfterFailure()
  }
  throw new Error('The Ubuntu debug host did not start systemd.')
}

function createDebugHost(runId) {
  if (containerExists()) {
    throw new Error(
      `${DEBUG_CONTAINER_NAME} already exists; use the debug down command first.`,
    )
  }
  run('docker', [
    'build',
    '--file',
    CONTAINERFILE,
    '--tag',
    DEBUG_IMAGE,
    'scripts/containers',
  ])
  run('docker', [
    'run',
    '--detach',
    '--name',
    DEBUG_CONTAINER_NAME,
    '--hostname',
    'kravhantering-production-smoke-debug',
    '--privileged',
    '--cgroupns=private',
    '--tmpfs',
    '/run',
    '--tmpfs',
    '/run/lock',
    '--add-host',
    'kravhantering.test:127.0.0.1',
    '--label',
    `${DEBUG_CONTAINER_LABEL}=${DEBUG_CONTAINER_LABEL_VALUE}`,
    '--label',
    `io.viscalyx.kravhantering.github-run-id=${runId}`,
    '--volume',
    `${process.cwd()}:/workspace`,
    DEBUG_IMAGE,
  ])
  waitForSystemd()
  run('docker', [
    'cp',
    process.execPath,
    `${DEBUG_CONTAINER_NAME}:/usr/local/bin/node`,
  ])
  const npmRoot = capture('npm', ['root', '--global'])
  dockerExec(['mkdir', '-p', '/usr/local/lib/node_modules'])
  run('docker', [
    'cp',
    path.join(npmRoot, 'npm'),
    `${DEBUG_CONTAINER_NAME}:/usr/local/lib/node_modules/npm`,
  ])
  dockerExec([
    'ln',
    '--symbolic',
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js',
    '/usr/local/bin/npm',
  ])
  run('docker', [
    'cp',
    capture('sh', ['-c', 'command -v "$1"', 'sh', 'gh']),
    `${DEBUG_CONTAINER_NAME}:/usr/local/bin/gh`,
  ])
  dockerExec(['node', '--version'])
  dockerExec(['npm', '--version'])
}

function collectEvidence(environment) {
  dockerExec(['scripts/containers/production-smoke.sh', 'evidence'], {
    allowFailure: true,
    environment,
  })
}

function runDebug(values) {
  fs.mkdirSync(path.join(DEBUG_CACHE_ROOT, 'docker'), { recursive: true })
  for (const command of ['docker', 'gh', 'npm', 'tar']) requireCommand(command)
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(
      'Production-smoke debug requires a Linux x86_64 Docker host.',
    )
  }
  const downloads = downloadRunArtifacts(values)
  prepareLocalEnvironmentFiles()
  run('node', [
    'scripts/containers/generate-tls.mjs',
    '--output-dir',
    'tmp/container-tls',
  ])
  const inputs = prepareInputs(downloads, values.runId)
  createDebugHost(values.runId)
  try {
    dockerExec([
      'node',
      'node_modules/@playwright/test/cli.js',
      'install-deps',
      'chromium',
    ])
    dockerExec([
      'node',
      'node_modules/@playwright/test/cli.js',
      'install',
      'chromium',
    ])
    dockerExec(
      [
        'scripts/containers/production-smoke.sh',
        'up',
        '--archive',
        inputs.archivePath,
      ],
      { environment: inputs.environment },
    )
    dockerExec(['scripts/containers/production-smoke.sh', 'verify'], {
      environment: inputs.environment,
    })
    collectEvidence(inputs.environment)
  } catch (error) {
    collectEvidence(inputs.environment)
    throw error
  }
  console.log(`Production smoke passed for GitHub run ${values.runId}.`)
  console.log(`Debug host remains available: ${USAGE.split('\n')[2].trim()}`)
}

function existingEnvironment() {
  const runId = ownedContainerRunId()
  return {
    PRODUCTION_SMOKE_EVIDENCE_DIR: path.join(runRoot(runId), 'evidence'),
    RELEASE_SMOKE_RUN_ID: runId,
    PRODUCTION_SMOKE_SCOPE: 'core',
  }
}

function shell() {
  ownedContainerRunId()
  const ttyArguments = process.stdin.isTTY ? ['--tty'] : []
  run('docker', [
    'exec',
    '--interactive',
    ...ttyArguments,
    '--workdir',
    '/workspace',
    DEBUG_CONTAINER_NAME,
    'bash',
  ])
}

function evidence() {
  collectEvidence(existingEnvironment())
}

function down() {
  if (!containerExists()) {
    console.log(`${DEBUG_CONTAINER_NAME} does not exist.`)
    return
  }
  const environment = existingEnvironment()
  dockerExec(['scripts/containers/production-smoke.sh', 'down'], {
    allowFailure: true,
    environment,
  })
  run('docker', ['container', 'rm', '--force', DEBUG_CONTAINER_NAME])
  console.log(`Removed ${DEBUG_CONTAINER_NAME}; evidence remains on the host.`)
}

export async function main(args) {
  try {
    const values = parseDebugArgs(args)
    if (values.command === 'help') {
      console.log(USAGE)
    } else if (values.command === 'run') {
      runDebug(values)
    } else if (values.command === 'shell') {
      shell()
    } else if (values.command === 'evidence') {
      evidence()
    } else if (values.command === 'down') {
      down()
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(USAGE)
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  process.exitCode = await main(process.argv.slice(2))
}
