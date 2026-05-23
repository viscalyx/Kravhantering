import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_RUNTIME_PACKAGE = 'kravhantering-app-runtime'
export const DB_JOB_PACKAGE = 'kravhantering-db-job'
export const DEFAULT_RELEASE_OUTPUT_DIR = 'tmp/container-release-artifacts'
export const DEPLOYMENT_BUNDLE_SCHEMA_VERSION = 1

const USAGE = `Usage:
  node scripts/release/container-release.mjs plan --gitversion-json <path> --output <path> [--github-env <path>] [--changed-files <path>]
  node scripts/release/container-release.mjs digests --plan <path> --app-metadata <path> --db-job-metadata <path> --output <path> [--github-env <path>]
  node scripts/release/container-release.mjs notes --plan <path> --metadata <path> --hashes <path> --output <path>
  node scripts/release/container-release.mjs bundle --plan <path> --metadata <path> --stack-lock <path> --output-dir <path> [--build-json <path>] [--hashes <path>] [--sbom-dir <path>]
  node scripts/release/container-release.mjs ensure-tag --plan <path>`

const RELEVANT_PATH_PREFIXES = [
  '.github/workflows/container-release.yml',
  'app/',
  'components/',
  'containers/',
  'i18n/',
  'lib/',
  'messages/',
  'middleware.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'public/',
  'docs/rhel10-production-deploy.md',
  'scripts/build-metadata.js',
  'scripts/containers/',
  'scripts/db-sqlserver-admin.mjs',
  'scripts/prebuild.js',
  'scripts/release/',
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
    source: 'docs/adr/0001-release-artifact-production-deployment.md',
    target: 'docs/adr/0001-release-artifact-production-deployment.md',
  },
  { source: 'containers/production/compose', target: 'compose' },
  { source: 'containers/production/env', target: 'env' },
  { source: 'containers/production/keycloak', target: 'keycloak' },
  { source: 'containers/production/nginx', target: 'nginx' },
  { source: 'containers/production/sqlserver', target: 'sqlserver' },
  { source: 'containers/production/systemd', target: 'systemd' },
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
  const baseTags = isStableRelease
    ? [version]
    : [`main-${shortSha}`, `sha-${sha}`]
  const tags =
    shouldCreatePreviewRelease && !baseTags.includes(version)
      ? [...baseTags, version]
      : baseTags

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
    DB_JOB_IMAGE: plan.dbJobImage,
    DB_JOB_PACKAGE: plan.dbJobPackage,
    DB_JOB_PRIMARY_TAG: plan.dbJobTags[0],
    DB_JOB_PRIMARY_TAG_NAME: plan.tags[0],
    DB_JOB_TAGS_CSV: csv(plan.dbJobTags),
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

export function extractBuildxDigest(metadata) {
  const digest =
    readNonEmpty(metadata?.['containerimage.digest']) ??
    readNonEmpty(metadata?.containerimage?.digest)
  if (!digest) {
    throw new Error('Buildx metadata is missing containerimage.digest.')
  }
  return digest
}

export function createReleaseMetadata(
  plan,
  appBuildxMetadata,
  dbJobBuildxMetadata,
) {
  const appRuntimeDigest = extractBuildxDigest(appBuildxMetadata)
  const dbJobDigest = extractBuildxDigest(dbJobBuildxMetadata)
  return {
    appRuntime: {
      digest: appRuntimeDigest,
      image: plan.appRuntimeImage,
      ref: `${plan.appRuntimeImage}@${appRuntimeDigest}`,
      tags: plan.appRuntimeTags,
    },
    commitSha: plan.commitSha,
    dbJob: {
      digest: dbJobDigest,
      image: plan.dbJobImage,
      ref: `${plan.dbJobImage}@${dbJobDigest}`,
      tags: plan.dbJobTags,
    },
    generatedAt: new Date().toISOString(),
    releaseTagName: plan.releaseTagName,
    version: plan.version,
  }
}

export function releaseMetadataEnv(metadata) {
  return {
    APP_RUNTIME_DIGEST: metadata.appRuntime.digest,
    APP_RUNTIME_DIGEST_REF: metadata.appRuntime.ref,
    DB_JOB_DIGEST: metadata.dbJob.digest,
    DB_JOB_DIGEST_REF: metadata.dbJob.ref,
  }
}

export function deploymentBundleBaseName(version) {
  const normalized = readNonEmpty(version) ?? '0.0.0-local'
  return `kravhantering-production-deploy-${normalized}`
}

export function deploymentBundleArchiveName(version) {
  return `${deploymentBundleBaseName(version)}.tar.gz`
}

function digestRef(service) {
  if (!service?.image || !service.digest) return undefined
  return `${service.image}@${service.digest}`
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
} = {}) {
  const timestamp = readNonEmpty(generatedAt) ?? new Date().toISOString()
  const services = {
    appRuntime: serviceByName(stackLock, 'app-runtime'),
    dbJob: serviceByName(stackLock, 'db-job'),
    keycloak: serviceByName(stackLock, 'keycloak'),
    nginx: serviceByName(stackLock, 'nginx'),
    sqlserver: serviceByName(stackLock, 'sqlserver'),
  }

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
      appRuntime: metadata.appRuntime?.ref ?? digestRef(services.appRuntime),
      dbJob: metadata.dbJob?.ref ?? digestRef(services.dbJob),
      nginx: digestRef(services.nginx),
      sqlserver: digestRef(services.sqlserver),
      keycloak: digestRef(services.keycloak),
    },
    supportedTopologies: [
      'app-node-external-sql-external-idp',
      'single-node-internal-sql-internal-keycloak',
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

  if (!plan || !metadata || !stackLock) {
    throw new Error('plan, metadata and stackLock are required.')
  }

  const bundleName = deploymentBundleBaseName(plan.version)
  const bundleRoot = path.resolve(cwd, outputDir, bundleName)
  fsImpl.rmSync(bundleRoot, { force: true, recursive: true })
  fsImpl.mkdirSync(bundleRoot, { recursive: true })

  for (const entry of DEPLOYMENT_BUNDLE_STATIC_ENTRIES) {
    copyBundleEntry(entry, bundleRoot, { cwd, fsImpl })
  }

  const dynamicFiles = [
    [options.stackLockPath, 'container-stack.lock.json'],
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

function hashesToMarkdown(content) {
  const lines = changedFilesFromText(content)
  return lines.length
    ? lines.map(line => `- \`${line}\``).join('\n')
    : '- No hashes recorded.'
}

export function renderReleaseNotes(plan, metadata, hashesContent) {
  const releaseKind = plan.isStableRelease
    ? 'Stable release'
    : 'Preview release'
  const lines = [
    `# ${releaseKind} ${plan.version}`,
    '',
    `Commit: \`${plan.commitSha}\``,
    `Workflow run: https://github.com/${plan.repository}/actions/runs/${plan.runId}`,
    '',
    '## Public GHCR Images',
    '',
    `- app-runtime: \`${metadata.appRuntime.ref}\``,
    `- db-job: \`${metadata.dbJob.ref}\``,
    '',
    '## Tags',
    '',
    ...metadata.appRuntime.tags.map(tag => `- \`${tag}\``),
    ...metadata.dbJob.tags.map(tag => `- \`${tag}\``),
    '',
    '## Production Deployment Bundle',
    '',
    `- \`${deploymentBundleArchiveName(plan.version)}\``,
    `- \`${deploymentBundleArchiveName(plan.version)}.sha256\``,
    '',
    '## Checksums',
    '',
    hashesToMarkdown(hashesContent),
    '',
    '## Verification',
    '',
    '- Cosign keyless signatures and GitHub Artifact Attestations were verified before Compose startup.',
    '- Release smoke artifacts are attached to this workflow run.',
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

    if (command === 'digests') {
      const plan = readJsonFile(options.plan, fsImpl)
      const metadata = createReleaseMetadata(
        plan,
        readJsonFile(options['app-metadata'], fsImpl),
        readJsonFile(options['db-job-metadata'], fsImpl),
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
      const metadata = readJsonFile(options.metadata, fsImpl)
      const hashes = fsImpl.existsSync(options.hashes)
        ? fsImpl.readFileSync(options.hashes, 'utf8')
        : ''
      writeTextFile(
        options.output,
        renderReleaseNotes(plan, metadata, hashes),
        fsImpl,
      )
      consoleObj.log(`Wrote ${options.output}`)
      return 0
    }

    if (command === 'bundle') {
      const plan = readJsonFile(options.plan, fsImpl)
      const metadata = readJsonFile(options.metadata, fsImpl)
      const stackLock = readJsonFile(options['stack-lock'], fsImpl)
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
