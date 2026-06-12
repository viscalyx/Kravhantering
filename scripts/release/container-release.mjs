import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertStackLockSchema } from '../containers/generate-stack-lock.mjs'
import { assertTestSupportLockSchema } from '../containers/generate-test-support-lock.mjs'
import {
  buildDemoUsersDocument,
  DEFAULT_DEMO_USERS_PATH,
  DEFAULT_DEV_REALM_PATH,
} from '../keycloak-demo-users.mjs'

export const APP_RUNTIME_PACKAGE = 'kravhantering-app-runtime'
export const DB_JOB_PACKAGE = 'kravhantering-db-job'
export const HSA_DIRECTORY_MOCK_PACKAGE = 'kravhantering-hsa-directory-mock'
export const DEFAULT_RELEASE_OUTPUT_DIR = 'tmp/container-release-artifacts'
export const DEFAULT_OPERATOR_UPGRADE_NOTES_PATH =
  'docs/operator-upgrade-notes.md'
export const DEPLOYMENT_BUNDLE_SCHEMA_VERSION = 2
export const APP_RUNTIME_DESCRIPTION =
  'Runnable Next.js application image for the production web runtime.'
export const DB_JOB_DESCRIPTION =
  'Database job image for SQL Server health checks, migrations and required seed operations.'
export const HSA_DIRECTORY_MOCK_DESCRIPTION =
  'Test-only HSA directory mock image for the single-node-demo release support topology.'

const USAGE = `Usage:
  node scripts/release/container-release.mjs plan --gitversion-json <path> --output <path> [--github-env <path>] [--changed-files <path>]
  node scripts/release/container-release.mjs identities --plan <path> --app-metadata <path> --db-job-metadata <path> [--hsa-directory-mock-metadata <path>] --output <path> [--github-env <path>]
  node scripts/release/container-release.mjs notes --plan <path> --metadata <path> --hashes <path> --output <path> [--operator-notes <path>]
  node scripts/release/container-release.mjs bundle --plan <path> --metadata <path> --stack-lock <path> --output-dir <path> [--test-support-lock <path>] [--build-json <path>] [--hashes <path>] [--sbom-dir <path>]
  node scripts/release/container-release.mjs ensure-tag --plan <path>`

const RELEVANT_PATH_PREFIXES = [
  '.github/workflows/container-release.yml',
  'app/',
  'components/',
  'containers/',
  'containers/kong/',
  'i18n/',
  'lib/',
  'messages/',
  'middleware.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'public/',
  'docs/images/',
  'docs/operator-upgrade-notes.md',
  'docs/rhel10-production-deploy.md',
  'docs/rhel10-production-disconnected.md',
  'docs/rhel10-production-uninstall.md',
  'docs/rhel10-production-upgrade.md',
  'docs/rhel10-production-single-node-self-contained-deploy.md',
  'docs/rhel10-production-single-node-self-contained-disconnected.md',
  'docs/rhel10-production-single-node-self-contained-uninstall.md',
  'docs/rhel10-production-single-node-self-contained-upgrade.md',
  'dev/keycloak/realm-kravhantering-dev.json',
  'scripts/build-metadata.js',
  'scripts/containers/',
  'scripts/db-sqlserver-admin.mjs',
  'scripts/keycloak-demo-users.mjs',
  'scripts/prebuild.js',
  'scripts/release/',
  'typeorm/seed.mjs',
  'typeorm/seed-archiving-retention-build.mjs',
  'typeorm/seed-dogfood.mjs',
  'typeorm/seed-dogfood-build.mjs',
  'typeorm/migrations/',
  'typeorm/seed-required.mjs',
  'typeorm/seed-runner.mjs',
]

export const DEPLOYMENT_BUNDLE_STATIC_ENTRIES = [
  {
    source: 'docs/rhel10-production-deploy.md',
    target: 'docs/rhel10-production-deploy.md',
  },
  {
    source: 'docs/rhel10-production-disconnected.md',
    target: 'docs/rhel10-production-disconnected.md',
  },
  {
    source: 'docs/rhel10-production-upgrade.md',
    target: 'docs/rhel10-production-upgrade.md',
  },
  {
    source: 'docs/rhel10-production-uninstall.md',
    target: 'docs/rhel10-production-uninstall.md',
  },
  {
    source: 'docs/rhel10-production-single-node-self-contained-deploy.md',
    target: 'docs/rhel10-production-single-node-self-contained-deploy.md',
  },
  {
    source: 'docs/rhel10-production-single-node-self-contained-disconnected.md',
    target: 'docs/rhel10-production-single-node-self-contained-disconnected.md',
  },
  {
    source: 'docs/rhel10-production-single-node-self-contained-upgrade.md',
    target: 'docs/rhel10-production-single-node-self-contained-upgrade.md',
  },
  {
    source: 'docs/rhel10-production-single-node-self-contained-uninstall.md',
    target: 'docs/rhel10-production-single-node-self-contained-uninstall.md',
  },
  { source: 'containers/production/compose', target: 'compose' },
  { source: 'containers/production/env', target: 'env' },
  { source: 'containers/production/keycloak', target: 'keycloak' },
  { source: 'containers/kong/kong.yml', target: 'kong/kong.yml' },
  { source: 'containers/production/nginx', target: 'nginx' },
  { source: 'containers/production/sqlserver', target: 'sqlserver' },
  { source: 'containers/production/systemd', target: 'systemd' },
  { source: 'containers/production/bin', target: 'bin' },
  {
    source: 'scripts/keycloak-demo-users.mjs',
    target: 'scripts/keycloak-demo-users.mjs',
  },
  { source: 'typeorm/seed.mjs', target: 'demo-seed/seed.mjs' },
  {
    source: 'typeorm/seed-dogfood.mjs',
    target: 'demo-seed/seed-dogfood.mjs',
  },
  {
    source: 'typeorm/seed-dogfood-build.mjs',
    target: 'demo-seed/seed-dogfood-build.mjs',
  },
  {
    source: 'typeorm/seed-archiving-retention-build.mjs',
    target: 'demo-seed/seed-archiving-retention-build.mjs',
  },
]

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readJsonFile(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
}

function writeJsonFile(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function writeTextFile(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, value)
}

export function extractUnreleasedOperatorUpgradeNotes(content, filePath) {
  const body = String(content ?? '')
  const headingMatch = body.match(/^##[ \t]+Unreleased[ \t]*$/mu)
  if (!headingMatch) {
    throw new Error(
      `Operator upgrade notes file ${filePath} must contain "## Unreleased".`,
    )
  }

  const afterHeading = body.slice(headingMatch.index + headingMatch[0].length)
  const nextReleaseHeadingIndex = afterHeading.search(/^##[ \t]+\S/mu)
  const unreleasedSection =
    nextReleaseHeadingIndex === -1
      ? afterHeading
      : afterHeading.slice(0, nextReleaseHeadingIndex)
  const trimmed = unreleasedSection.trim()

  return trimmed.length > 0 ? trimmed : undefined
}

export function readOperatorUpgradeNotes(
  filePath = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  fsImpl = fs,
) {
  if (typeof fsImpl.existsSync === 'function' && !fsImpl.existsSync(filePath)) {
    throw new Error(`Operator upgrade notes file is missing: ${filePath}.`)
  }

  let content
  try {
    content = fsImpl.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Operator upgrade notes file is missing: ${filePath}.`)
    }
    throw error
  }

  return extractUnreleasedOperatorUpgradeNotes(content, filePath)
}

function parseArgs(args) {
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

function normalizeOwner(owner) {
  const normalized = readNonEmpty(owner)?.toLowerCase()
  if (!normalized) throw new Error('Repository owner is required.')
  return normalized
}

export function isStableReleaseRef(ref, refName) {
  return (
    /^refs\/tags\/v\d+\.\d+\.\d+$/u.test(ref ?? '') ||
    /^v\d+\.\d+\.\d+$/u.test(refName ?? '')
  )
}

export function stableVersionFromRef(ref, refName) {
  const value =
    readNonEmpty(refName) ?? String(ref ?? '').replace(/^refs\/tags\//u, '')
  const match = value.match(/^v(?<version>\d+\.\d+\.\d+)$/u)
  return match?.groups?.version
}

export function isMainRef(ref, refName) {
  return ref === 'refs/heads/main' || refName === 'main'
}

export function isReleaseRelevantPath(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/')
  return RELEVANT_PATH_PREFIXES.some(prefix =>
    prefix.endsWith('/')
      ? normalized.startsWith(prefix)
      : normalized === prefix || normalized.startsWith(`${prefix}/`),
  )
}

export function changedFilesFromText(content) {
  return String(content)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
}

export function readChangedFiles(options = {}) {
  const env = options.env ?? process.env
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const cwd = options.cwd ?? process.cwd()
  const before = readNonEmpty(env.GITHUB_EVENT_BEFORE)
  const head = readNonEmpty(env.GITHUB_SHA) ?? 'HEAD'

  if (!before || /^0+$/u.test(before)) {
    try {
      return changedFilesFromText(
        execFileSync(
          'git',
          ['diff-tree', '--no-commit-id', '--name-only', '-r', head],
          {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        ),
      )
    } catch {
      return []
    }
  }

  return changedFilesFromText(
    execFileSync('git', ['diff', '--name-only', before, head], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  )
}

function gitVersionValue(gitVersion, key, fallback) {
  return readNonEmpty(gitVersion?.[key]) ?? fallback
}

function versionWithoutBuildMetadata(version) {
  return version.replace(/\+.*/u, '')
}

function csv(values) {
  return values.join(',')
}

export function createReleasePlan(input = {}) {
  const env = input.env ?? process.env
  const gitVersion = input.gitVersion ?? {}
  const repository =
    readNonEmpty(input.repository) ?? readNonEmpty(env.GITHUB_REPOSITORY)
  const repositoryOwner =
    readNonEmpty(input.repositoryOwner) ??
    readNonEmpty(env.GITHUB_REPOSITORY_OWNER) ??
    repository?.split('/')[0]
  const owner = normalizeOwner(repositoryOwner)
  const sha =
    readNonEmpty(input.sha) ?? readNonEmpty(env.GITHUB_SHA) ?? 'unknown'
  const shortSha = sha.slice(0, 12)
  const ref = readNonEmpty(input.ref) ?? readNonEmpty(env.GITHUB_REF) ?? ''
  const refName =
    readNonEmpty(input.refName) ??
    readNonEmpty(env.GITHUB_REF_NAME) ??
    ref.replace(/^refs\/(?:heads|tags)\//u, '')
  const runId =
    readNonEmpty(input.runId) ?? readNonEmpty(env.GITHUB_RUN_ID) ?? 'local'
  const eventName =
    readNonEmpty(input.eventName) ??
    readNonEmpty(env.GITHUB_EVENT_NAME) ??
    'workflow_dispatch'
  const changedFiles = input.changedFiles ?? []
  const isStableRelease = isStableReleaseRef(ref, refName)
  const isMain = isMainRef(ref, refName)
  const hasRelevantChange =
    changedFiles.length === 0 ? false : changedFiles.some(isReleaseRelevantPath)
  const shouldCreatePreviewRelease =
    !isStableRelease && isMain && hasRelevantChange
  const rawVersion =
    (isStableRelease ? stableVersionFromRef(ref, refName) : undefined) ??
    gitVersionValue(gitVersion, 'FullSemVer', undefined) ??
    gitVersionValue(gitVersion, 'SemVer', undefined) ??
    '0.0.0-local'
  const version = versionWithoutBuildMetadata(rawVersion)
  const releaseTagName =
    isStableRelease || shouldCreatePreviewRelease ? `v${version}` : ''
  const appRuntimeImage = `ghcr.io/${owner}/${APP_RUNTIME_PACKAGE}`
  const dbJobImage = `ghcr.io/${owner}/${DB_JOB_PACKAGE}`
  const hsaDirectoryMockImage = `ghcr.io/${owner}/${HSA_DIRECTORY_MOCK_PACKAGE}`
  const commitTags = [`main-${shortSha}`, `sha-${sha}`]
  const tags = isStableRelease
    ? [version]
    : shouldCreatePreviewRelease
      ? [version, ...commitTags]
      : commitTags

  return {
    appRuntimeImage,
    appRuntimePackage: APP_RUNTIME_PACKAGE,
    appRuntimeTags: tags.map(tag => `${appRuntimeImage}:${tag}`),
    buildImageTag: `${appRuntimeImage}:${tags[0]}`,
    changedFiles,
    commitSha: sha,
    createGitHubRelease: isStableRelease || shouldCreatePreviewRelease,
    dbJobImage,
    dbJobPackage: DB_JOB_PACKAGE,
    dbJobTags: tags.map(tag => `${dbJobImage}:${tag}`),
    eventName,
    hasRelevantChange,
    hsaDirectoryMockImage,
    hsaDirectoryMockPackage: HSA_DIRECTORY_MOCK_PACKAGE,
    hsaDirectoryMockTags: tags.map(tag => `${hsaDirectoryMockImage}:${tag}`),
    isMain,
    isStableRelease,
    makeLatest: isStableRelease,
    owner,
    prerelease: shouldCreatePreviewRelease,
    ref,
    refName,
    releaseTagName,
    repository,
    runId,
    shouldCreatePreviewRelease,
    shortSha,
    tag: tags[0],
    tags,
    version,
  }
}

export function githubEnvLines(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`)
}

export function releasePlanEnv(plan) {
  return {
    APP_RUNTIME_DESCRIPTION,
    APP_RUNTIME_IMAGE: plan.appRuntimeImage,
    APP_RUNTIME_PACKAGE: plan.appRuntimePackage,
    APP_RUNTIME_PRIMARY_TAG: plan.appRuntimeTags[0],
    APP_RUNTIME_PRIMARY_TAG_NAME: plan.tags[0],
    APP_RUNTIME_TAGS_CSV: csv(plan.appRuntimeTags),
    BUILD_COMMIT_SHA: plan.commitSha,
    BUILD_IMAGE_TAG: plan.buildImageTag,
    BUILD_VERSION: plan.version,
    CONTAINER_PROJECT_NAME: `kravhantering-container-stack-release-smoke-${plan.runId}`,
    CONTAINER_STACK_RUN_ID: plan.runId,
    DB_JOB_DESCRIPTION,
    DB_JOB_IMAGE: plan.dbJobImage,
    DB_JOB_PACKAGE: plan.dbJobPackage,
    DB_JOB_PRIMARY_TAG: plan.dbJobTags[0],
    DB_JOB_PRIMARY_TAG_NAME: plan.tags[0],
    DB_JOB_TAGS_CSV: csv(plan.dbJobTags),
    HSA_DIRECTORY_MOCK_DESCRIPTION,
    HSA_DIRECTORY_MOCK_IMAGE: plan.hsaDirectoryMockImage,
    HSA_DIRECTORY_MOCK_PACKAGE: plan.hsaDirectoryMockPackage,
    HSA_DIRECTORY_MOCK_PRIMARY_TAG: plan.hsaDirectoryMockTags[0],
    HSA_DIRECTORY_MOCK_PRIMARY_TAG_NAME: plan.tags[0],
    HSA_DIRECTORY_MOCK_TAGS_CSV: csv(plan.hsaDirectoryMockTags),
    RELEASE_CREATE_GITHUB_RELEASE: String(plan.createGitHubRelease),
    RELEASE_IS_STABLE: String(plan.isStableRelease),
    RELEASE_MAKE_LATEST: String(plan.makeLatest),
    RELEASE_PRERELEASE: String(plan.prerelease),
    RELEASE_SMOKE_RUN_ID: plan.runId,
    RELEASE_TAG_NAME: plan.releaseTagName,
    RELEASE_VERSION: plan.version,
  }
}

function appendGithubEnv(filePath, values, fsImpl = fs) {
  if (!filePath) return
  const lines = githubEnvLines(values)
  fsImpl.appendFileSync(filePath, `${lines.join('\n')}\n`)
}

function readGitVersionFile(filePath, fsImpl = fs) {
  if (!filePath) return {}
  return readJsonFile(filePath, fsImpl)
}

function readChangedFilesFile(filePath, fsImpl = fs) {
  if (!filePath) return undefined
  return changedFilesFromText(fsImpl.readFileSync(filePath, 'utf8'))
}

export function extractBuildxManifestDigest(metadata) {
  const manifestDigest =
    readNonEmpty(metadata?.['containerimage.digest']) ??
    readNonEmpty(metadata?.containerimage?.digest)
  if (!manifestDigest) {
    throw new Error('Buildx metadata is missing containerimage.digest.')
  }
  return manifestDigest
}

export function extractBuildxImageId(metadata) {
  const descriptorAnnotations =
    metadata?.['containerimage.descriptor']?.annotations ??
    metadata?.containerimage?.descriptor?.annotations
  const imageId =
    readNonEmpty(metadata?.['containerimage.config.digest']) ??
    readNonEmpty(metadata?.containerimage?.config?.digest) ??
    readNonEmpty(metadata?.containerimage?.configDigest) ??
    readNonEmpty(descriptorAnnotations?.['config.digest'])
  if (!imageId) {
    throw new Error('Buildx metadata is missing containerimage.config.digest.')
  }
  return imageId
}

function createImageMetadata(image, tags, buildxMetadata) {
  const manifestDigest = extractBuildxManifestDigest(buildxMetadata)
  const imageId = extractBuildxImageId(buildxMetadata)
  return {
    imageId,
    image,
    manifestDigest,
    manifestRef: `${image}@${manifestDigest}`,
    tags,
  }
}

export function createReleaseMetadata(
  plan,
  appBuildxMetadata,
  dbJobBuildxMetadata,
  hsaDirectoryMockBuildxMetadata,
) {
  const testSupport = hsaDirectoryMockBuildxMetadata
    ? {
        hsaDirectoryMock: createImageMetadata(
          plan.hsaDirectoryMockImage,
          plan.hsaDirectoryMockTags,
          hsaDirectoryMockBuildxMetadata,
        ),
      }
    : undefined
  return {
    appRuntime: createImageMetadata(
      plan.appRuntimeImage,
      plan.appRuntimeTags,
      appBuildxMetadata,
    ),
    commitSha: plan.commitSha,
    dbJob: createImageMetadata(
      plan.dbJobImage,
      plan.dbJobTags,
      dbJobBuildxMetadata,
    ),
    generatedAt: new Date().toISOString(),
    releaseTagName: plan.releaseTagName,
    ...(testSupport ? { testSupport } : {}),
    version: plan.version,
  }
}

export function releaseMetadataEnv(metadata) {
  const values = {
    APP_RUNTIME_IMAGE_ID: metadata.appRuntime.imageId,
    APP_RUNTIME_MANIFEST_DIGEST: metadata.appRuntime.manifestDigest,
    APP_RUNTIME_MANIFEST_DIGEST_REF: metadata.appRuntime.manifestRef,
    DB_JOB_IMAGE_ID: metadata.dbJob.imageId,
    DB_JOB_MANIFEST_DIGEST: metadata.dbJob.manifestDigest,
    DB_JOB_MANIFEST_DIGEST_REF: metadata.dbJob.manifestRef,
  }
  const hsaDirectoryMock = metadata.testSupport?.hsaDirectoryMock
  if (hsaDirectoryMock) {
    values.HSA_DIRECTORY_MOCK_IMAGE_ID = hsaDirectoryMock.imageId
    values.HSA_DIRECTORY_MOCK_MANIFEST_DIGEST = hsaDirectoryMock.manifestDigest
    values.HSA_DIRECTORY_MOCK_MANIFEST_DIGEST_REF = hsaDirectoryMock.manifestRef
  }
  return values
}

export function deploymentBundleBaseName(version) {
  const normalized = readNonEmpty(version) ?? '0.0.0-local'
  return `kravhantering-production-deploy-${normalized}`
}

export function deploymentBundleArchiveName(version) {
  return `${deploymentBundleBaseName(version)}.tar.gz`
}

function manifestRef(service) {
  if (!service?.image || !service.manifestDigest) return undefined
  return `${service.image}@${service.manifestDigest}`
}

function imageId(service) {
  return readNonEmpty(service?.imageId)
}

function serviceByName(stackLock, name) {
  return stackLock.services?.find(service => service.name === name)
}

export function createDeploymentBundleManifest({
  files = [],
  generatedAt,
  metadata,
  plan,
  stackLock,
  testSupportLock,
} = {}) {
  assertStackLockSchema(stackLock)
  if (testSupportLock) {
    assertTestSupportLockSchema(testSupportLock)
  }
  const timestamp = readNonEmpty(generatedAt) ?? new Date().toISOString()
  const services = {
    appRuntime: serviceByName(stackLock, 'app-runtime'),
    dbJob: serviceByName(stackLock, 'db-job'),
    keycloak: serviceByName(stackLock, 'keycloak'),
    nginx: serviceByName(stackLock, 'nginx'),
    sqlserver: serviceByName(stackLock, 'sqlserver'),
  }
  const testSupportServices = testSupportLock
    ? {
        hsaDirectoryMock: serviceByName(testSupportLock, 'hsa-directory-mock'),
        kong: serviceByName(testSupportLock, 'kong'),
      }
    : undefined

  return {
    schemaVersion: DEPLOYMENT_BUNDLE_SCHEMA_VERSION,
    name: deploymentBundleBaseName(plan.version),
    version: plan.version,
    commitSha: plan.commitSha,
    generatedAt: timestamp,
    sourceRelease: {
      tag: plan.releaseTagName,
      workflowRun: `https://github.com/${plan.repository}/actions/runs/${plan.runId}`,
    },
    images: {
      appRuntime:
        metadata.appRuntime?.manifestRef ?? manifestRef(services.appRuntime),
      dbJob: metadata.dbJob?.manifestRef ?? manifestRef(services.dbJob),
      nginx: manifestRef(services.nginx),
      sqlserver: manifestRef(services.sqlserver),
      keycloak: manifestRef(services.keycloak),
    },
    imageIds: {
      appRuntime: metadata.appRuntime?.imageId ?? imageId(services.appRuntime),
      dbJob: metadata.dbJob?.imageId ?? imageId(services.dbJob),
      nginx: imageId(services.nginx),
      sqlserver: imageId(services.sqlserver),
      keycloak: imageId(services.keycloak),
    },
    ...(testSupportServices
      ? {
          testSupportImages: {
            hsaDirectoryMock:
              metadata.testSupport?.hsaDirectoryMock?.manifestRef ??
              manifestRef(testSupportServices.hsaDirectoryMock),
            kong: manifestRef(testSupportServices.kong),
          },
          testSupportImageIds: {
            hsaDirectoryMock:
              metadata.testSupport?.hsaDirectoryMock?.imageId ??
              imageId(testSupportServices.hsaDirectoryMock),
            kong: imageId(testSupportServices.kong),
          },
        }
      : {}),
    supportedTopologies: [
      'app-node-external-sql-external-idp',
      'single-node-internal-sql-internal-keycloak',
      ...(testSupportServices ? ['single-node-demo'] : []),
    ],
    files: [...files].sort(),
  }
}

function copyBundleEntry(entry, bundleRoot, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const source = path.resolve(cwd, entry.source)
  const target = path.resolve(bundleRoot, entry.target)

  fsImpl.mkdirSync(path.dirname(target), { recursive: true })
  fsImpl.cpSync(source, target, { recursive: true })
}

const MARKDOWN_IMAGE_PATTERN =
  /!\[[^\]\n]*\]\((?<target><[^>\n]+>|[^)\s\n]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/gu
const MARKDOWN_REMOTE_TARGET_PATTERN = /^[a-z][a-z0-9+.-]*:/iu

function normalizeBundleRelativePath(value) {
  const normalized = path.posix.normalize(String(value).replaceAll('\\', '/'))
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    return undefined
  }
  return normalized
}

function markdownImageTargets(content) {
  return [...String(content).matchAll(MARKDOWN_IMAGE_PATTERN)]
    .map(match => match.groups?.target?.trim())
    .filter(Boolean)
}

function markdownLocalAssetTarget(target) {
  let localTarget = target.trim()
  if (localTarget.startsWith('<') && localTarget.endsWith('>')) {
    localTarget = localTarget.slice(1, -1).trim()
  }

  localTarget = localTarget.replace(/[?#].*$/u, '')
  if (
    !localTarget ||
    localTarget.startsWith('/') ||
    localTarget.startsWith('#') ||
    MARKDOWN_REMOTE_TARGET_PATTERN.test(localTarget)
  ) {
    return undefined
  }
  return localTarget
}

export function resolveBundledMarkdownAssets(entry, content) {
  const sourcePath = normalizeBundleRelativePath(entry.source)
  const targetPath = normalizeBundleRelativePath(entry.target)
  if (!sourcePath?.endsWith('.md') || !targetPath?.endsWith('.md')) {
    return []
  }

  const assetsByTarget = new Map()
  const sourceDir = path.posix.dirname(sourcePath)
  const targetDir = path.posix.dirname(targetPath)

  for (const rawTarget of markdownImageTargets(content)) {
    const localTarget = markdownLocalAssetTarget(rawTarget)
    if (!localTarget) continue

    const source = normalizeBundleRelativePath(
      path.posix.join(sourceDir, localTarget),
    )
    const target = normalizeBundleRelativePath(
      path.posix.join(targetDir, localTarget),
    )
    if (!source || !target) {
      throw new Error(
        `Bundled Markdown asset link escapes the bundle root: ${rawTarget}`,
      )
    }
    if (source.startsWith('public/')) {
      throw new Error(
        `Bundled Markdown ${sourcePath} links to ${source}. Move release documentation images under docs/.`,
      )
    }
    assetsByTarget.set(target, { source, target })
  }

  return [...assetsByTarget.values()]
}

function copyBundleMarkdownAssets(entry, bundleRoot, options = {}) {
  if (!String(entry.source).endsWith('.md')) return

  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const source = path.resolve(cwd, entry.source)
  const content = fsImpl.readFileSync(source, 'utf8')

  for (const asset of resolveBundledMarkdownAssets(entry, content)) {
    copyBundleEntry(asset, bundleRoot, { cwd, fsImpl })
  }
}

function copyOptionalFile(source, target, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const absoluteSource = path.resolve(cwd, source)
  if (!fsImpl.existsSync(absoluteSource)) return false

  const absoluteTarget = path.resolve(target)
  fsImpl.mkdirSync(path.dirname(absoluteTarget), { recursive: true })
  fsImpl.copyFileSync(absoluteSource, absoluteTarget)
  return true
}

function listFilesRecursive(root, options = {}) {
  const fsImpl = options.fsImpl ?? fs
  const files = []

  function visit(dir) {
    for (const entry of fsImpl.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(absolute)
        continue
      }
      if (entry.isFile()) {
        files.push(path.relative(root, absolute).replaceAll(path.sep, '/'))
      }
    }
  }

  visit(root)
  return files.sort()
}

export function stageProductionDeploymentBundle(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const outputDir =
    readNonEmpty(options.outputDir) ??
    path.join(DEFAULT_RELEASE_OUTPUT_DIR, 'deployment')
  const plan = options.plan
  const metadata = options.metadata
  const stackLock = options.stackLock
  const testSupportLock = options.testSupportLock

  if (!plan || !metadata || !stackLock) {
    throw new Error('plan, metadata and stackLock are required.')
  }

  const bundleName = deploymentBundleBaseName(plan.version)
  const bundleRoot = path.resolve(cwd, outputDir, bundleName)
  fsImpl.rmSync(bundleRoot, { force: true, recursive: true })
  fsImpl.mkdirSync(bundleRoot, { recursive: true })

  for (const entry of DEPLOYMENT_BUNDLE_STATIC_ENTRIES) {
    copyBundleEntry(entry, bundleRoot, { cwd, fsImpl })
    copyBundleMarkdownAssets(entry, bundleRoot, { cwd, fsImpl })
  }

  const demoUsersDocument = buildDemoUsersDocument(
    readJsonFile(path.resolve(cwd, DEFAULT_DEV_REALM_PATH), fsImpl),
    { generatedAt: options.generatedAt },
  )
  writeJsonFile(
    path.join(bundleRoot, DEFAULT_DEMO_USERS_PATH),
    demoUsersDocument,
    fsImpl,
  )

  const dynamicFiles = [
    [options.stackLockPath, 'container-stack.lock.json'],
    [options.testSupportLockPath, 'container-test-support.lock.json'],
    [options.metadataPath, 'release-metadata.json'],
    [options.buildJsonPath, 'public/build.json'],
    [options.hashesPath, 'hashes.sha256'],
  ]
  const sbomDir = readNonEmpty(options.sbomDir)
  if (sbomDir) {
    dynamicFiles.push(
      [
        path.join(sbomDir, 'app-runtime.spdx.json'),
        'sbom/app-runtime.spdx.json',
      ],
      [path.join(sbomDir, 'db-job.spdx.json'), 'sbom/db-job.spdx.json'],
      [
        path.join(sbomDir, 'hsa-directory-mock.spdx.json'),
        'sbom/hsa-directory-mock.spdx.json',
      ],
    )
  }

  for (const [source, target] of dynamicFiles) {
    if (!readNonEmpty(source)) continue
    copyOptionalFile(source, path.join(bundleRoot, target), { cwd, fsImpl })
  }

  const filesBeforeManifest = listFilesRecursive(bundleRoot, { fsImpl })
  const manifest = createDeploymentBundleManifest({
    files: [...filesBeforeManifest, 'DEPLOYMENT-MANIFEST.json'],
    generatedAt: options.generatedAt,
    metadata,
    plan,
    stackLock,
    testSupportLock,
  })
  writeJsonFile(
    path.join(bundleRoot, 'DEPLOYMENT-MANIFEST.json'),
    manifest,
    fsImpl,
  )

  return {
    archiveName: deploymentBundleArchiveName(plan.version),
    bundleName,
    bundleRoot,
    files: listFilesRecursive(bundleRoot, { fsImpl }),
    manifest,
  }
}

function parseJsonText(content, fallback) {
  try {
    return JSON.parse(content)
  } catch {
    return fallback
  }
}

function cleanSingleLine(value) {
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value))
}

function repositoryPackageUrl(plan, packageName) {
  return `https://github.com/${plan.repository}/pkgs/container/${encodePathSegment(packageName)}`
}

function packageTagFallbackUrls(plan, packageName, tags = []) {
  const fallbackUrl = repositoryPackageUrl(plan, packageName)
  return Object.fromEntries(tags.map(tag => [tag, fallbackUrl]))
}

export function packageVersionUrlFromVersions(
  plan,
  packageName,
  versions,
  tag,
) {
  if (!Array.isArray(versions)) return undefined
  const match = versions.find(version =>
    version?.metadata?.container?.tags?.includes(tag),
  )
  const packageVersionId =
    match?.id === undefined || match?.id === null
      ? undefined
      : readNonEmpty(String(match.id))
  if (packageVersionId) {
    return (
      `https://github.com/${plan.repository}/pkgs/container/` +
      `${encodePathSegment(packageName)}/${packageVersionId}` +
      `?tag=${encodeURIComponent(tag)}`
    )
  }
  return readNonEmpty(match?.html_url) ?? readNonEmpty(match?.package_html_url)
}

export function packageTagUrlsFromVersions(
  plan,
  packageName,
  versions,
  tags = [],
) {
  return Object.fromEntries(
    tags.map(tag => [
      tag,
      packageVersionUrlFromVersions(plan, packageName, versions, tag) ??
        repositoryPackageUrl(plan, packageName),
    ]),
  )
}

export function resolvePackageTagUrls(
  plan,
  packageName,
  tags = [],
  options = {},
) {
  const normalizedTags = tags.filter(Boolean)
  if (
    !plan.repository ||
    !plan.owner ||
    !packageName ||
    normalizedTags.length === 0
  ) {
    return {}
  }

  const owner = encodePathSegment(plan.owner)
  const packageSegment = encodePathSegment(packageName)
  const endpoints = [
    `/orgs/${owner}/packages/container/${packageSegment}/versions?per_page=100`,
    `/users/${owner}/packages/container/${packageSegment}/versions?per_page=100`,
  ]

  for (const endpoint of endpoints) {
    try {
      const versions = parseJsonText(
        execText('gh', ['api', endpoint], options),
        [],
      )
      return packageTagUrlsFromVersions(
        plan,
        packageName,
        versions,
        normalizedTags,
      )
    } catch {
      // Fall back below when the package API is unavailable for this token.
    }
  }

  return packageTagFallbackUrls(plan, packageName, normalizedTags)
}

export function resolvePackageVersionUrl(plan, packageName, tag, options = {}) {
  return resolvePackageTagUrls(plan, packageName, [tag], options)[tag]
}

function imageTagUrls(imageRefs = [], rawTags = [], rawTagUrls = {}) {
  return Object.fromEntries(
    imageRefs.map((imageRef, index) => {
      const rawTag = rawTags[index] ?? imageRef.split(':').at(-1)
      return [imageRef, rawTagUrls[rawTag]]
    }),
  )
}

export function withReleasePackageUrls(plan, metadata, options = {}) {
  const rawTags = plan.tags ?? []
  const appRuntimePackage = plan.appRuntimePackage ?? APP_RUNTIME_PACKAGE
  const dbJobPackage = plan.dbJobPackage ?? DB_JOB_PACKAGE
  const hsaDirectoryMockPackage =
    plan.hsaDirectoryMockPackage ?? HSA_DIRECTORY_MOCK_PACKAGE
  const appRuntimeTagUrls = resolvePackageTagUrls(
    plan,
    appRuntimePackage,
    rawTags,
    options,
  )
  const dbJobTagUrls = resolvePackageTagUrls(
    plan,
    dbJobPackage,
    rawTags,
    options,
  )
  const hsaDirectoryMock = metadata.testSupport?.hsaDirectoryMock
  const hsaDirectoryMockTagUrls = hsaDirectoryMock
    ? resolvePackageTagUrls(plan, hsaDirectoryMockPackage, rawTags, options)
    : {}
  return {
    ...metadata,
    appRuntime: {
      ...metadata.appRuntime,
      tagUrls: imageTagUrls(
        metadata.appRuntime.tags,
        rawTags,
        appRuntimeTagUrls,
      ),
    },
    dbJob: {
      ...metadata.dbJob,
      tagUrls: imageTagUrls(metadata.dbJob.tags, rawTags, dbJobTagUrls),
    },
    ...(hsaDirectoryMock
      ? {
          testSupport: {
            ...metadata.testSupport,
            hsaDirectoryMock: {
              ...hsaDirectoryMock,
              tagUrls: imageTagUrls(
                hsaDirectoryMock.tags,
                rawTags,
                hsaDirectoryMockTagUrls,
              ),
            },
          },
        }
      : {}),
  }
}

function isSameReleaseKind(plan, release) {
  const isPrerelease = release?.isPrerelease === true
  return plan.prerelease ? isPrerelease : !isPrerelease
}

export function selectPreviousReleaseTag(plan, releases = []) {
  if (!plan.releaseTagName) return undefined
  const match = releases.find(
    release =>
      release?.tagName &&
      release.tagName !== plan.releaseTagName &&
      release.isDraft !== true &&
      isSameReleaseKind(plan, release),
  )
  return readNonEmpty(match?.tagName)
}

export function readPublishedGitHubReleases(plan, options = {}) {
  if (!plan.repository) return []
  const output = execText(
    'gh',
    [
      'release',
      'list',
      '--repo',
      plan.repository,
      '--limit',
      '100',
      '--exclude-drafts',
      '--json',
      'tagName,isPrerelease,isDraft,publishedAt',
    ],
    options,
  )
  const releases = parseJsonText(output, [])
  return Array.isArray(releases) ? releases : []
}

export function readGeneratedReleaseNotes(plan, previousTagName, options = {}) {
  if (!plan.releaseTagName || !previousTagName) return undefined
  const output = execText(
    'gh',
    [
      'api',
      `repos/${plan.repository}/releases/generate-notes`,
      '--method',
      'POST',
      '-f',
      `tag_name=${plan.releaseTagName}`,
      '-f',
      `target_commitish=${plan.commitSha}`,
      '-f',
      `previous_tag_name=${previousTagName}`,
      '-f',
      'configuration_file_path=.github/release.yml',
    ],
    options,
  )
  const response = parseJsonText(output, {})
  return readNonEmpty(response?.body)
}

export function createReleaseChangelog(plan, options = {}) {
  if (!plan.releaseTagName) {
    return {
      commits: [],
      generatedNotes: undefined,
      generatedNotesNotice: undefined,
      previousTagName: undefined,
    }
  }

  let previousTagName
  let generatedNotes
  let generatedNotesNotice

  try {
    previousTagName = selectPreviousReleaseTag(
      plan,
      readPublishedGitHubReleases(plan, options),
    )
  } catch (error) {
    generatedNotesNotice = `GitHub release lookup was unavailable: ${cleanSingleLine(error instanceof Error ? error.message : error)}`
  }

  if (!previousTagName) {
    generatedNotesNotice =
      generatedNotesNotice ??
      `No previous ${plan.prerelease ? 'preview' : 'stable'} GitHub Release was found.`
    return {
      commits: [],
      generatedNotes,
      generatedNotesNotice,
      previousTagName,
    }
  }

  try {
    generatedNotes = readGeneratedReleaseNotes(plan, previousTagName, options)
  } catch (error) {
    generatedNotesNotice = `GitHub-generated release notes were unavailable: ${cleanSingleLine(error instanceof Error ? error.message : error)}`
  }

  return {
    commits: [],
    generatedNotes,
    generatedNotesNotice,
    previousTagName,
  }
}

function renderGeneratedNotesSection(changelog) {
  const generatedNotes = readNonEmpty(changelog?.generatedNotes)
  if (generatedNotes) {
    return /^##\s+What's Changed\b/mu.test(generatedNotes)
      ? generatedNotes
      : `## What's Changed\n\n${generatedNotes}`
  }

  const notice = readNonEmpty(changelog?.generatedNotesNotice)
  if (!notice) return undefined

  return `## What's Changed\n\n${notice}`
}

function codeLink(value, url) {
  const code = `\`${value}\``
  return url ? `[${code}](${url})` : code
}

function releaseAssetDownloadUrl(plan, assetName) {
  if (!plan.repository || !plan.releaseTagName) return undefined
  return (
    `https://github.com/${plan.repository}/releases/download/` +
    `${encodePathSegment(plan.releaseTagName)}/${encodePathSegment(assetName)}`
  )
}

function renderContainerImageBlock(packageName, description, imageMetadata) {
  return [
    `### ${packageName}`,
    '',
    description,
    '',
    ...imageMetadata.tags.map(
      imageRef => `- ${codeLink(imageRef, imageMetadata.tagUrls?.[imageRef])}`,
    ),
    '',
    'Immutable manifest digest reference:',
    '',
    `- \`${imageMetadata.manifestRef}\``,
    '',
  ]
}

function renderTestSupportContainerImagesSection(plan, metadata) {
  const hsaDirectoryMock = metadata.testSupport?.hsaDirectoryMock
  if (!hsaDirectoryMock) return []

  return [
    '',
    '## Test Support Container Images',
    '',
    'These images support the test-only `single-node-demo` topology and are not part of the production runtime topology.',
    '',
    ...renderContainerImageBlock(
      plan.hsaDirectoryMockPackage ?? HSA_DIRECTORY_MOCK_PACKAGE,
      HSA_DIRECTORY_MOCK_DESCRIPTION,
      hsaDirectoryMock,
    ),
  ]
}

function renderOperatorUpgradeNotesSection(operatorUpgradeNotes) {
  const notes = readNonEmpty(operatorUpgradeNotes)
  if (!notes) return undefined
  return `## Operator Upgrade Notes\n\n${notes}`
}

export function renderReleaseNotes(
  plan,
  metadata,
  _hashesContent,
  changelog,
  operatorUpgradeNotes,
) {
  const generatedNotesSection = renderGeneratedNotesSection(changelog)
  const operatorUpgradeNotesSection =
    renderOperatorUpgradeNotesSection(operatorUpgradeNotes)
  const deploymentArchive = deploymentBundleArchiveName(plan.version)
  const deploymentChecksum = `${deploymentArchive}.sha256`
  const lines = [
    ...(generatedNotesSection ? [generatedNotesSection, ''] : []),
    ...(operatorUpgradeNotesSection ? [operatorUpgradeNotesSection, ''] : []),
    '## Container Images',
    '',
    ...renderContainerImageBlock(
      plan.appRuntimePackage ?? APP_RUNTIME_PACKAGE,
      APP_RUNTIME_DESCRIPTION,
      metadata.appRuntime,
    ),
    ...renderContainerImageBlock(
      plan.dbJobPackage ?? DB_JOB_PACKAGE,
      DB_JOB_DESCRIPTION,
      metadata.dbJob,
    ),
    ...renderTestSupportContainerImagesSection(plan, metadata),
    '',
    '## Production Deployment Bundle',
    '',
    `- ${codeLink(deploymentArchive, releaseAssetDownloadUrl(plan, deploymentArchive))}`,
    `- ${codeLink(deploymentChecksum, releaseAssetDownloadUrl(plan, deploymentChecksum))}`,
    '',
  ]

  return `${lines.join('\n')}`
}

function execText(command, args, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runCommand(command, args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`)
  }
}

export function ensureGitTag(plan, options = {}) {
  if (!plan.releaseTagName) return 'skipped'
  const existing = (() => {
    try {
      return execText(
        'git',
        ['rev-parse', `${plan.releaseTagName}^{}`],
        options,
      )
    } catch {
      return undefined
    }
  })()

  if (existing) {
    if (existing !== plan.commitSha) {
      throw new Error(
        `Release tag ${plan.releaseTagName} already points at ${existing}, not ${plan.commitSha}.`,
      )
    }
    return 'exists'
  }

  runCommand('git', ['tag', plan.releaseTagName, plan.commitSha], options)
  runCommand('git', ['push', 'origin', plan.releaseTagName], options)
  return 'created'
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const fsImpl = dependencies.fsImpl ?? fs
  const env = dependencies.env ?? process.env
  try {
    const { command, options } = parseArgs(args)

    if (command === 'plan') {
      const gitVersion = readGitVersionFile(options['gitversion-json'], fsImpl)
      const changedFiles =
        readChangedFilesFile(options['changed-files'], fsImpl) ??
        readChangedFiles({
          cwd: dependencies.cwd,
          env,
          execFileSync: dependencies.execFileSync,
        })
      const plan = createReleasePlan({
        changedFiles,
        env,
        gitVersion,
      })
      writeJsonFile(options.output, plan, fsImpl)
      appendGithubEnv(options['github-env'], releasePlanEnv(plan), fsImpl)
      consoleObj.log(`Wrote ${options.output}`)
      return 0
    }

    if (command === 'identities' || command === 'digests') {
      const plan = readJsonFile(options.plan, fsImpl)
      const hsaDirectoryMockBuildxMetadata = options[
        'hsa-directory-mock-metadata'
      ]
        ? readJsonFile(options['hsa-directory-mock-metadata'], fsImpl)
        : undefined
      const metadata = createReleaseMetadata(
        plan,
        readJsonFile(options['app-metadata'], fsImpl),
        readJsonFile(options['db-job-metadata'], fsImpl),
        hsaDirectoryMockBuildxMetadata,
      )
      writeJsonFile(options.output, metadata, fsImpl)
      appendGithubEnv(
        options['github-env'],
        releaseMetadataEnv(metadata),
        fsImpl,
      )
      consoleObj.log(`Wrote ${options.output}`)
      return 0
    }

    if (command === 'notes') {
      const plan = readJsonFile(options.plan, fsImpl)
      const metadata = withReleasePackageUrls(
        plan,
        readJsonFile(options.metadata, fsImpl),
        {
          cwd: dependencies.cwd,
          env,
          execFileSync: dependencies.execFileSync,
        },
      )
      const hashes = fsImpl.existsSync(options.hashes)
        ? fsImpl.readFileSync(options.hashes, 'utf8')
        : ''
      const changelog = createReleaseChangelog(plan, {
        cwd: dependencies.cwd,
        env,
        execFileSync: dependencies.execFileSync,
      })
      const operatorUpgradeNotes = readOperatorUpgradeNotes(
        options['operator-notes'] ?? DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
        fsImpl,
      )
      writeTextFile(
        options.output,
        renderReleaseNotes(
          plan,
          metadata,
          hashes,
          changelog,
          operatorUpgradeNotes,
        ),
        fsImpl,
      )
      consoleObj.log(`Wrote ${options.output}`)
      return 0
    }

    if (command === 'bundle') {
      const plan = readJsonFile(options.plan, fsImpl)
      const metadata = readJsonFile(options.metadata, fsImpl)
      const stackLock = readJsonFile(options['stack-lock'], fsImpl)
      const testSupportLock = options['test-support-lock']
        ? readJsonFile(options['test-support-lock'], fsImpl)
        : undefined
      const result = stageProductionDeploymentBundle({
        buildJsonPath: options['build-json'],
        cwd: dependencies.cwd,
        fsImpl,
        generatedAt: options['generated-at'],
        hashesPath: options.hashes,
        metadata,
        metadataPath: options.metadata,
        outputDir: options['output-dir'],
        plan,
        sbomDir: options['sbom-dir'],
        stackLock,
        stackLockPath: options['stack-lock'],
        testSupportLock,
        testSupportLockPath: options['test-support-lock'],
      })
      consoleObj.log(
        `Staged ${path.relative(dependencies.cwd ?? process.cwd(), result.bundleRoot)}`,
      )
      return 0
    }

    if (command === 'ensure-tag') {
      const plan = readJsonFile(options.plan, fsImpl)
      const result = ensureGitTag(plan, {
        cwd: dependencies.cwd,
        env,
        execFileSync: dependencies.execFileSync,
        spawnSync: dependencies.spawnSync,
      })
      consoleObj.log(`Release tag ${result}.`)
      return 0
    }

    consoleObj.error(USAGE)
    return 1
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
