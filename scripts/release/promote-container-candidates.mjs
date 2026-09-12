import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertPublicationAllowed,
  RELEASE_IMAGE_ROLES,
  readPublicationEvidence,
} from './publication.mjs'

const USAGE = `Usage:
  node scripts/release/promote-container-candidates.mjs --plan <path> --metadata <path> --output <path>`

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
  return RELEASE_IMAGE_ROLES.map(([objectPath, name]) => {
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
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).trim()
}

export function promoteCandidates(metadata, options = {}) {
  const plan = options.plan
  const evidence = options.evidence ?? readPublicationEvidence(plan, options)
  assertPublicationAllowed(plan, metadata, evidence)
  const progress = { staged: [], promoted: [] }
  try {
    const entries = promotionEntries(metadata)
    const remote = new Map()
    const inspect = tag => {
      try {
        return inspectDigest(tag, options)
      } catch (error) {
        if (
          /manifest unknown|name unknown|manifest_unknown|name_unknown/iu.test(
            String(error.stderr ?? error.message),
          )
        )
          return undefined
        throw new Error(`Cannot verify ${tag}: ${error.message}`)
      }
    }
    // Check all existing identities before writes. Never replace a conflicting tag.
    for (const entry of entries) {
      const execFileSync = options.execFileSync ?? childProcess.execFileSync
      const local = execFileSync(
        'skopeo',
        [
          'inspect',
          '--format',
          '{{.Digest}}',
          `oci-archive:${entry.artifactPath}`,
        ],
        { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env },
      ).trim()
      if (local !== entry.manifestDigest)
        throw new Error(`Candidate content mismatch for ${entry.name}.`)
      for (const tag of [entry.stagingTag, ...entry.tags]) {
        const digest = inspect(tag)
        if (digest && digest !== entry.manifestDigest)
          throw new Error(
            `Conflicting published content for ${tag}: ${digest}; expected ${entry.manifestDigest}. Preserve it and reconcile manually.`,
          )
        remote.set(tag, digest)
      }
    }
    const copy = (entry, source, tag) => {
      if (remote.get(tag)) return 'preserved'
      try {
        execute(
          'skopeo',
          ['copy', '--all', '--preserve-digests', source, `docker://${tag}`],
          options,
        )
      } catch (error) {
        // A failed response is uncertain. Observe remote state without retrying the write.
        if (inspect(tag) !== entry.manifestDigest)
          throw new Error(
            `Publication incomplete for ${tag}: ${error.message}. Inspect remote state and rerun failed jobs manually.`,
          )
      }
      if (inspect(tag) !== entry.manifestDigest)
        throw new Error(`Published digest mismatch for ${tag}.`)
      return 'published'
    }
    for (const entry of entries)
      progress.staged.push({
        name: entry.name,
        tag: entry.stagingTag,
        manifestDigest: entry.manifestDigest,
        outcome: copy(
          entry,
          `oci-archive:${entry.artifactPath}`,
          entry.stagingTag,
        ),
      })
    for (const entry of entries) {
      for (const tag of entry.tags)
        progress.promoted.push({
          name: entry.name,
          tag,
          manifestDigest: entry.manifestDigest,
          outcome: copy(entry, `docker://${entry.stagingTag}`, tag),
        })
    }
    return progress
  } catch (error) {
    error.promotionResult = progress
    throw error
  }
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
    if (!options.plan || !options.metadata || !output) {
      consoleObj.error(USAGE)
      return 1
    }
    const metadata = JSON.parse(fsImpl.readFileSync(options.metadata, 'utf8'))
    const plan = JSON.parse(fsImpl.readFileSync(options.plan, 'utf8'))
    const result = promoteCandidates(metadata, { ...dependencies, plan })
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
          ...error.promotionResult,
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
