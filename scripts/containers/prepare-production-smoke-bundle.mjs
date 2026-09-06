import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stageProductionDeploymentBundle } from '../release/container-release.mjs'

const USAGE = `Usage:
  node scripts/containers/prepare-production-smoke-bundle.mjs \\
    --version <version> --commit-sha <sha> --run-id <id> \\
    --app-ref <ref> --app-image-id <sha256:id> \\
    --db-job-ref <ref> --db-job-image-id <sha256:id> \\
    --stack-lock <path> --output-dir <path>`

export function parseArgs(args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]
    const value = args[index + 1]
    if (!option?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Invalid option near ${option ?? '<end>'}.`)
    }
    values[option.slice(2)] = value
  }

  const required = [
    'version',
    'commit-sha',
    'run-id',
    'app-ref',
    'app-image-id',
    'db-job-ref',
    'db-job-image-id',
    'stack-lock',
    'output-dir',
  ]
  for (const key of required) {
    if (!values[key]) throw new Error(`Missing --${key}.`)
  }
  return values
}

function digestFromImageId(imageId) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) {
    throw new Error(`Invalid image ID: ${imageId}`)
  }
  return imageId
}

function imageMetadata(reference, imageId, manifest) {
  digestFromImageId(imageId)
  const manifestDigest = digestFromImageId(manifest ?? imageId)
  return {
    imageId,
    manifestDigest,
    manifestRef: `${reference}@${manifestDigest}`,
  }
}

export function buildSmokeBundleInputs(values, options = {}) {
  const fsImpl = options.fsImpl ?? fs
  const buildJsonPath = options.buildJsonPath ?? 'public/build.json'
  const build = JSON.parse(fsImpl.readFileSync(buildJsonPath, 'utf8'))
  return {
    metadata: {
      appRuntime: imageMetadata(
        values['app-ref'],
        values['app-image-id'],
        values['app-manifest-digest'],
      ),
      database: {
        expectedSchemaVersion: build.expectedDatabaseSchemaVersion,
      },
      dbJob: imageMetadata(
        values['db-job-ref'],
        values['db-job-image-id'],
        values['db-job-manifest-digest'],
      ),
    },
    plan: {
      commitSha: values['commit-sha'],
      expectedDatabaseSchemaVersion: build.expectedDatabaseSchemaVersion,
      releaseTagName: `ci-${values['run-id']}`,
      repository: process.env.GITHUB_REPOSITORY ?? 'viscalyx/Kravhantering',
      runId: values['run-id'],
      version: values.version,
    },
  }
}

export function prepareProductionSmokeBundle(values, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const fsImpl = options.fsImpl ?? fs
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  const now = options.now ?? (() => new Date())
  const stageBundle = options.stageBundle ?? stageProductionDeploymentBundle
  const buildJsonPath = path.resolve(
    cwd,
    options.buildJsonPath ?? 'public/build.json',
  )
  const stackLockPath = path.resolve(cwd, values['stack-lock'])
  const stackLock = JSON.parse(fsImpl.readFileSync(stackLockPath, 'utf8'))
  const { metadata, plan } = buildSmokeBundleInputs(values, {
    buildJsonPath,
    fsImpl,
  })
  const outputDir = path.resolve(cwd, values['output-dir'])
  const result = stageBundle({
    buildJsonPath,
    cwd,
    generatedAt: now().toISOString(),
    metadata,
    outputDir,
    plan,
    stackLock,
    stackLockPath,
  })
  const archivePath = path.join(outputDir, '..', result.archiveName)
  execFileSync(
    'tar',
    ['-C', outputDir, '-czf', archivePath, result.bundleName],
    { cwd, stdio: 'inherit' },
  )
  return { ...result, archivePath }
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  try {
    const result = prepareProductionSmokeBundle(parseArgs(args), dependencies)
    consoleObj.log(result.archivePath)
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
