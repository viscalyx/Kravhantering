export const DEBUG_CONTAINER_NAME = 'kravhantering-production-smoke-debug'
export const DEBUG_CONTAINER_LABEL =
  'io.viscalyx.kravhantering.production-smoke-debug'
export const DEBUG_CONTAINER_LABEL_VALUE = 'true'
export const DEFAULT_REPOSITORY = 'viscalyx/Kravhantering'

const COMMANDS_WITHOUT_OPTIONS = new Set(['down', 'evidence', 'shell'])
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u

export function parseDebugArgs(args) {
  const [command, ...options] = args
  if (command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help' }
  }
  if (COMMANDS_WITHOUT_OPTIONS.has(command)) {
    if (options.length > 0) {
      throw new Error(`${command} does not accept options.`)
    }
    return { command }
  }
  if (command !== 'run') {
    throw new Error('Expected run, shell, evidence, down, or help.')
  }

  const values = { command, repository: DEFAULT_REPOSITORY }
  const supportedOptions = new Set(['--repo', '--run-id'])
  for (let index = 0; index < options.length; index += 2) {
    const option = options[index]
    const value = options[index + 1]
    if (!supportedOptions.has(option) || !value || value.startsWith('--')) {
      throw new Error(`Invalid run option near ${option ?? '<end>'}.`)
    }
    const key = option === '--repo' ? 'repository' : 'runId'
    values[key] = value
  }
  if (!/^\d+$/u.test(values.runId ?? '')) {
    throw new Error('run requires a numeric --run-id.')
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(values.repository)) {
    throw new Error('--repo must use the owner/repository form.')
  }
  return values
}

export function selectRunArtifacts(artifacts, runId) {
  const expectedNames = {
    'app-runtime': 'container-candidate-app-runtime',
    'db-job': 'container-candidate-db-job',
    runtime: 'production-assembly-evidence',
  }
  const selected = {}
  for (const [kind, name] of Object.entries(expectedNames)) {
    const matches = artifacts.filter(artifact => artifact.name === name)
    if (matches.length !== 1) {
      throw new Error(
        `Run ${runId} must have one available ${name} artifact (found ${matches.length}).`,
      )
    }
    if (matches[0].expired) {
      throw new Error(`Run artifact ${name} has expired.`)
    }
    selected[kind] = name
  }
  return selected
}

export function validateDownloadedArtifactCache({
  artifactRoot,
  fsImpl,
  requiredPaths,
}) {
  for (const requiredPath of requiredPaths) {
    if (
      fsImpl.existsSync(requiredPath) &&
      fsImpl.statSync(requiredPath).size > 0
    ) {
      continue
    }
    fsImpl.rmSync(artifactRoot, { force: true, recursive: true })
    throw new Error(
      `Downloaded run artifact is incomplete: ${requiredPath}; cleared incomplete cache at ${artifactRoot}.`,
    )
  }
}

function assertDigest(value, context) {
  if (!DIGEST_PATTERN.test(value ?? '')) {
    throw new Error(`${context} must be a sha256 digest.`)
  }
  return value
}

export function selectOciManifest(index) {
  const manifests = index?.manifests ?? []
  const runnable = manifests.filter(descriptor => {
    const platform = descriptor.platform
    return (
      !descriptor.annotations?.['vnd.docker.reference.type'] &&
      (!platform ||
        (platform.os === 'linux' && platform.architecture === 'amd64'))
    )
  })
  if (runnable.length !== 1) {
    throw new Error(
      `OCI archive must contain one linux/amd64 image manifest (found ${runnable.length}).`,
    )
  }
  assertDigest(runnable[0].digest, 'OCI manifest descriptor digest')
  return runnable[0]
}

export function parseOciImageMetadata(index, manifest) {
  const descriptor = selectOciManifest(index)
  const annotations = descriptor.annotations ?? {}
  const reference =
    annotations['io.containerd.image.name'] ??
    annotations['org.opencontainers.image.ref.name']
  if (!reference?.includes(':')) {
    throw new Error('OCI manifest does not declare its tagged image reference.')
  }
  const imageId = assertDigest(
    manifest?.config?.digest,
    'OCI image config digest',
  )
  return { descriptor, imageId, reference }
}

export function serviceImageReference(lock, name) {
  const service = lock?.services?.find(candidate => candidate.name === name)
  if (!service?.image || !service?.tag) {
    throw new Error(`Stack lock is missing the ${name} image reference.`)
  }
  return `${service.image}:${service.tag}`
}

export function buildSmokeEnvironment({
  evidenceDirectory,
  imageArchives,
  imageMetadata,
  runId,
  stackLock,
}) {
  const projectImages = {
    APP_RUNTIME: 'app-runtime',
    DB_JOB: 'db-job',
  }
  const environment = {
    CONTAINER_STACK_RUN_ID: runId,
    PRODUCTION_SMOKE_SCOPE: 'core',
    KEYCLOAK_IMAGE_REF: serviceImageReference(stackLock, 'keycloak'),
    NGINX_IMAGE_REF: serviceImageReference(stackLock, 'nginx'),
    PRODUCTION_SMOKE_EVIDENCE_DIR: evidenceDirectory,
    RELEASE_SMOKE_RUN_ID: runId,
    SQLSERVER_IMAGE_REF: serviceImageReference(stackLock, 'sqlserver'),
  }
  for (const [prefix, name] of Object.entries(projectImages)) {
    const metadata = imageMetadata[name]
    const archive = imageArchives[name]
    if (!metadata?.reference || !metadata?.imageId || !archive) {
      throw new Error(`Debug inputs are incomplete for ${name}.`)
    }
    environment[`${prefix}_IMAGE_REF`] = metadata.reference
    environment[`${prefix}_IMAGE_ID`] = metadata.imageId
    environment[`${prefix}_OCI_ARCHIVE`] = archive
  }
  return environment
}
