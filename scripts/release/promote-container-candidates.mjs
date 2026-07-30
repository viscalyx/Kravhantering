import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const IMAGE_PATHS = [
  ['appRuntime', 'app-runtime'],
  ['dbJob', 'db-job'],
  ['demoSeed', 'demo-seed'],
  ['testSupport.hsaDirectoryMock', 'hsa-directory-mock'],
  ['hsaIntegrationSupport.hsaPersonLookupAdapter', 'hsa-person-lookup-adapter'],
]
const USAGE = `Usage:
  node scripts/release/promote-container-candidates.mjs --metadata <path> --output <path>`

export function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}.`)
    }
    options[arg.slice(2)] = value
    index += 1
  }
  return options
}

function objectAtPath(value, objectPath) {
  return objectPath.split('.').reduce((current, key) => current?.[key], value)
}

function repositoryFromTag(tag) {
  const separator = tag.lastIndexOf(':')
  if (separator <= tag.lastIndexOf('/')) {
    throw new Error(`Promoted image reference must include a tag: ${tag}.`)
  }
  return tag.slice(0, separator)
}

export function promotionEntries(metadata) {
  return IMAGE_PATHS.map(([objectPath, name]) => {
    const image = objectAtPath(metadata, objectPath)
    if (
      !image?.candidate?.artifactPath ||
      !image.candidate.manifestDigest ||
      image.candidate.manifestDigest !== image.manifestDigest ||
      !Array.isArray(image.tags) ||
      image.tags.length === 0
    ) {
      throw new Error(`Release metadata is incomplete for ${name}.`)
    }
    const repository = repositoryFromTag(image.tags[0])
    if (image.tags.some(tag => repositoryFromTag(tag) !== repository)) {
      throw new Error(`Release tags span multiple repositories for ${name}.`)
    }
    return {
      artifactPath: image.candidate.artifactPath,
      manifestDigest: image.manifestDigest,
      name,
      stagingTag: `${repository}:candidate-${image.manifestDigest.replace(':', '-')}`,
      tags: image.tags,
    }
  })
}

function execute(command, args, options = {}) {
  const spawnSync = options.spawnSync ?? childProcess.spawnSync
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status}.`,
    )
  }
}

function inspectDigest(tag, options = {}) {
  const execFileSync = options.execFileSync ?? childProcess.execFileSync
  return execFileSync(
    'skopeo',
    ['inspect', '--format', '{{.Digest}}', `docker://${tag}`],
    {
      cwd: options.cwd,
      encoding: 'utf8',
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  ).trim()
}

export function promoteCandidates(metadata, options = {}) {
  const entries = promotionEntries(metadata)
  const staged = []
  for (const entry of entries) {
    execute(
      'skopeo',
      [
        'copy',
        '--all',
        '--preserve-digests',
        '--retry-times',
        '3',
        `oci-archive:${entry.artifactPath}`,
        `docker://${entry.stagingTag}`,
      ],
      options,
    )
    const remoteManifestDigest = inspectDigest(entry.stagingTag, options)
    if (remoteManifestDigest !== entry.manifestDigest) {
      throw new Error(
        `Staged digest mismatch for ${entry.stagingTag}: expected ${entry.manifestDigest}, received ${remoteManifestDigest}.`,
      )
    }
    staged.push({
      manifestDigest: entry.manifestDigest,
      name: entry.name,
      tag: entry.stagingTag,
    })
  }

  const promoted = []
  for (const entry of entries) {
    for (const tag of entry.tags) {
      execute(
        'skopeo',
        [
          'copy',
          '--all',
          '--preserve-digests',
          '--retry-times',
          '3',
          `docker://${entry.stagingTag}`,
          `docker://${tag}`,
        ],
        options,
      )
      const remoteManifestDigest = inspectDigest(tag, options)
      if (remoteManifestDigest !== entry.manifestDigest) {
        throw new Error(
          `Published digest mismatch for ${tag}: expected ${entry.manifestDigest}, received ${remoteManifestDigest}.`,
        )
      }
      promoted.push({
        manifestDigest: entry.manifestDigest,
        name: entry.name,
        tag,
      })
    }
  }
  return { promoted, staged }
}

/* v8 ignore start -- File orchestration is exercised by the workflow contract. */
function writeJson(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const fsImpl = dependencies.fsImpl ?? fs
  let output
  try {
    const options = parseArgs(args)
    output = options.output
    if (!options.metadata || !output) {
      consoleObj.error(USAGE)
      return 1
    }
    const metadata = JSON.parse(fsImpl.readFileSync(options.metadata, 'utf8'))
    const result = promoteCandidates(metadata, dependencies)
    writeJson(
      output,
      {
        passed: true,
        ...result,
        schemaVersion: 1,
      },
      fsImpl,
    )
    consoleObj.log(
      `Staged ${result.staged.length} images and promoted and verified ${result.promoted.length} image tags.`,
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (output) {
      writeJson(
        output,
        {
          errors: [message],
          passed: false,
          schemaVersion: 1,
        },
        fsImpl,
      )
    }
    consoleObj.error(message)
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
/* v8 ignore stop */
