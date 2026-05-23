const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// cSpell:ignore GITVERSION FULLSEMVER

const DEFAULT_OUTPUT_PATH = path.join('public', 'build.json')
const DEFAULT_IMAGE_TAG = 'local-dev'
const UNKNOWN_COMMIT_SHA = 'unknown'

function readNonEmpty(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readPackageVersion(packageJsonPath, fsImpl) {
  const raw = fsImpl.readFileSync(packageJsonPath, 'utf8')
  const parsed = JSON.parse(raw)
  const version = readNonEmpty(parsed.version)
  if (!version) {
    throw new Error(`Missing version in ${packageJsonPath}`)
  }
  return version
}

function readGitCommitSha(cwd, execFileSync) {
  try {
    return (
      readNonEmpty(
        execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ) ?? UNKNOWN_COMMIT_SHA
    )
  } catch {
    return UNKNOWN_COMMIT_SHA
  }
}

function createBuildMetadata(options = {}) {
  const env = options.env ?? process.env
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const cwd = options.cwd ?? process.cwd()
  const packageJsonPath =
    options.packageJsonPath ?? path.join(cwd, 'package.json')
  const now = options.now ?? (() => new Date())

  return {
    version:
      readNonEmpty(env.BUILD_VERSION) ??
      readNonEmpty(env.GITVERSION_FULLSEMVER) ??
      readPackageVersion(packageJsonPath, fsImpl),
    commitSha:
      readNonEmpty(env.BUILD_COMMIT_SHA) ??
      readNonEmpty(env.GITHUB_SHA) ??
      readGitCommitSha(cwd, execFileSync),
    builtAt: readNonEmpty(env.BUILD_TIME) ?? now().toISOString(),
    imageTag: readNonEmpty(env.BUILD_IMAGE_TAG) ?? DEFAULT_IMAGE_TAG,
  }
}

function writeBuildMetadata(options = {}) {
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH
  const fsImpl = options.fsImpl ?? fs
  const outputBase = options.cwd ?? process.cwd()
  const resolvedOutputPath = path.resolve(outputBase, outputPath)
  const metadata = createBuildMetadata(options)

  fsImpl.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
  fsImpl.writeFileSync(
    resolvedOutputPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
  )
  return metadata
}

module.exports = {
  DEFAULT_IMAGE_TAG,
  DEFAULT_OUTPUT_PATH,
  UNKNOWN_COMMIT_SHA,
  createBuildMetadata,
  writeBuildMetadata,
}
