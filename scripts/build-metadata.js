const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// cSpell:ignore DOTNET GITVERSION FULLSEMVER showvariable

const DEFAULT_OUTPUT_PATH = path.join('public', 'build.json')
const DEFAULT_IMAGE_TAG = 'local-dev'
const UNKNOWN_COMMIT_SHA = 'unknown'
const GITVERSION_TOOL_MANIFEST_PATH = path.join('.config', 'dotnet-tools.json')

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

function uniqueValues(values) {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function getDotnetCommandCandidates(env) {
  const dotnetRoot = readNonEmpty(env.DOTNET_ROOT)
  const home = readNonEmpty(env.HOME)
  const hostPath = readNonEmpty(env.DOTNET_HOST_PATH)
  const dotnetBinary = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'

  return uniqueValues(
    [
      hostPath,
      dotnetRoot ? path.join(dotnetRoot, dotnetBinary) : undefined,
      home ? path.join(home, '.dotnet', dotnetBinary) : undefined,
      'dotnet',
    ].filter(Boolean),
  )
}

function readGitVersionSemVer(cwd, env, fsImpl, execFileSync) {
  if (!fsImpl.existsSync(path.join(cwd, GITVERSION_TOOL_MANIFEST_PATH))) {
    return undefined
  }

  const args = [
    'tool',
    'run',
    'dotnet-gitversion',
    '/output',
    'json',
    '/showvariable',
    'SemVer',
  ]

  for (const dotnetCommand of getDotnetCommandCandidates(env)) {
    try {
      const version = readNonEmpty(
        execFileSync(dotnetCommand, args, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      )
      if (version) return version
    } catch {
      // Try the next likely dotnet location, then fall back to package.json.
    }
  }

  return undefined
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
      readNonEmpty(env.GITVERSION_SEMVER) ??
      readNonEmpty(env.GITVERSION_FULLSEMVER) ??
      readGitVersionSemVer(cwd, env, fsImpl, execFileSync) ??
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
