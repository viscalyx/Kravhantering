#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const RELEASE_ATTESTATION_PREDICATE_TYPE =
  'https://github.com/viscalyx/Kravhantering/attestations/deployment-release/v1'

const GH_ATTESTATION_VERIFY_TIMEOUT_MS = 30_000

const USAGE = `Usage:
  node scripts/release/deployment-provenance.mjs predicate --plan <path> --output <path>
  node scripts/release/deployment-provenance.mjs stage-guide --plan <path> --deployment-dir <path> --guide <path>
  node scripts/release/deployment-provenance.mjs append-notes --plan <path> --notes <path> --attestation-url <url>
  node scripts/release/deployment-provenance.mjs verify --subject <path> --repository <owner/repo> --signer-workflow <owner/repo/workflow> --source-digest <sha> --source-ref <ref> --release-version <version> --release-tag <tag> [--bundle <path> --trusted-root <path>]`

function required(value, optionName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required option --${optionName}`)
  }
  return value.trim()
}

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(required(filePath, 'path'), 'utf8'))
}

function writeText(filePath, content, fsImpl = fs) {
  const target = required(filePath, 'output')
  fsImpl.mkdirSync(path.dirname(target), { recursive: true })
  fsImpl.writeFileSync(target, content)
}

export function deploymentArchiveName(version) {
  return `kravhantering-production-deploy-${version}.tar.gz`
}

export function deploymentAttestationBundleName(version) {
  return `${deploymentArchiveName(version)}.sigstore.json`
}

export function deploymentTrustedRootName(version) {
  return `${deploymentArchiveName(version)}.trusted-root.jsonl`
}

export function createDeploymentReleasePredicate(plan) {
  return {
    schemaVersion: 1,
    repository: plan.repository,
    release: {
      version: plan.version,
      tag: plan.releaseTagName,
      prerelease: plan.prerelease,
    },
    source: {
      commitSha: plan.commitSha,
      ref: plan.ref,
    },
  }
}

export function stageVerificationGuide(options, fsImpl = fs) {
  const deploymentDir = required(options.deploymentDir, 'deployment-dir')
  const guide = required(options.guide, 'guide')
  const bundleName = deploymentArchiveName(options.plan.version).replace(
    /\.tar\.gz$/u,
    '',
  )
  const relativeGuide =
    'docs/operations/release-artifact-and-image-verification.md'
  const bundleRoot = path.join(deploymentDir, bundleName)
  const manifestPath = path.join(bundleRoot, 'DEPLOYMENT-MANIFEST.json')
  const manifest = readJson(manifestPath, fsImpl)
  if (!Array.isArray(manifest.files)) {
    throw new Error('Deployment manifest files must be an array')
  }

  const target = path.join(bundleRoot, relativeGuide)
  fsImpl.mkdirSync(path.dirname(target), { recursive: true })
  fsImpl.copyFileSync(guide, target)
  manifest.files = [...new Set([...manifest.files, relativeGuide])].sort()
  writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, fsImpl)
  return target
}

function releaseAssetUrl(plan, assetName) {
  return `https://github.com/${plan.repository}/releases/download/${plan.releaseTagName}/${encodeURIComponent(assetName)}`
}

export function renderDeploymentProvenanceNotes(plan, attestationUrl) {
  const bundle = deploymentAttestationBundleName(plan.version)
  const trustedRoot = deploymentTrustedRootName(plan.version)
  const guideUrl = `https://github.com/${plan.repository}/blob/${plan.commitSha}/docs/operations/release-artifact-and-image-verification.md`

  return [
    '## Deployment archive provenance verification',
    '',
    'The SHA-256 checksum proves transfer integrity. The identity-bound attestation separately proves the archive origin and must be verified before extraction. Disconnected sites use the bundled evidence or require an approved exception.',
    '',
    `- [GitHub attestation for this archive digest](${required(attestationUrl, 'attestation-url')})`,
    `- [\`${bundle}\`](${releaseAssetUrl(plan, bundle)})`,
    `- [\`${trustedRoot}\`](${releaseAssetUrl(plan, trustedRoot)})`,
    `- Release version and tag: \`${plan.version}\`, \`${plan.releaseTagName}\``,
    `- Source commit and ref: \`${plan.commitSha}\`, \`${plan.ref}\``,
    '',
    `Verification must constrain the archive digest, repository, signer workflow, source commit and ref, and release identity. Follow the [release artifact verification guide](${guideUrl}).`,
    '',
  ].join('\n')
}

export function buildGhVerificationArgs(options) {
  const bundle = options.bundle?.trim()
  const trustedRoot = options.trustedRoot?.trim()
  if (Boolean(bundle) !== Boolean(trustedRoot)) {
    throw new Error('--bundle and --trusted-root must be supplied together')
  }

  const args = [
    'attestation',
    'verify',
    required(options.subject, 'subject'),
    '--repo',
    required(options.repository, 'repository'),
    '--signer-workflow',
    required(options.signerWorkflow, 'signer-workflow'),
    '--source-digest',
    required(options.sourceDigest, 'source-digest'),
    '--source-ref',
    required(options.sourceRef, 'source-ref'),
    '--predicate-type',
    RELEASE_ATTESTATION_PREDICATE_TYPE,
    '--format',
    'json',
  ]

  if (bundle && trustedRoot) {
    args.push('--bundle', bundle, '--custom-trusted-root', trustedRoot)
  }
  return args
}

function sha256File(filePath, fsImpl = fs) {
  return crypto
    .createHash('sha256')
    .update(fsImpl.readFileSync(filePath))
    .digest('hex')
}

export function verificationMatchesPolicy(verification, options, fsImpl = fs) {
  const releaseVersion = required(options.releaseVersion, 'release-version')
  const releaseTag = required(options.releaseTag, 'release-tag')
  if (!Array.isArray(verification)) return false
  const subject = required(options.subject, 'subject')
  const digest = sha256File(subject, fsImpl)
  const name = path.basename(subject)

  return verification.some(entry => {
    const statement = entry?.verificationResult?.statement
    const predicate = statement?.predicate
    return (
      statement?.predicateType === RELEASE_ATTESTATION_PREDICATE_TYPE &&
      predicate?.schemaVersion === 1 &&
      predicate?.repository === options.repository &&
      predicate?.source?.commitSha === options.sourceDigest &&
      predicate?.source?.ref === options.sourceRef &&
      predicate?.release?.version === releaseVersion &&
      predicate?.release?.tag === releaseTag &&
      statement?.subject?.some(
        candidate =>
          candidate?.name === name && candidate?.digest?.sha256 === digest,
      )
    )
  })
}

export function verifyDeploymentProvenance(options, dependencies = {}) {
  const fsImpl = dependencies.fsImpl ?? fs
  const run = dependencies.execFileSyncImpl ?? execFileSync
  const output = run('gh', buildGhVerificationArgs(options), {
    encoding: 'utf8',
    timeout: GH_ATTESTATION_VERIFY_TIMEOUT_MS,
  })
  let verification
  try {
    verification = JSON.parse(output)
  } catch {
    throw new Error('GitHub CLI returned invalid verification JSON')
  }
  if (!verificationMatchesPolicy(verification, options, fsImpl)) {
    throw new Error('Attestation does not match the expected release identity')
  }
  return verification
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid option sequence near ${name ?? '<end>'}`)
    }
    options[name.slice(2)] = value
  }
  return options
}

export function normalizeVerificationOptions(options) {
  return {
    subject: options.subject,
    repository: options.repository,
    signerWorkflow: options['signer-workflow'],
    sourceDigest: options['source-digest'],
    sourceRef: options['source-ref'],
    releaseVersion: options['release-version'],
    releaseTag: options['release-tag'],
    bundle: options.bundle,
    trustedRoot: options['trusted-root'],
  }
}

export async function main(args, dependencies = {}) {
  const fsImpl = dependencies.fsImpl ?? fs
  const consoleObj = dependencies.consoleObj ?? console
  const [command, ...optionArgs] = args
  const options = parseOptions(optionArgs)

  if (command === 'predicate') {
    const plan = readJson(options.plan, fsImpl)
    writeText(
      options.output,
      `${JSON.stringify(createDeploymentReleasePredicate(plan), null, 2)}\n`,
      fsImpl,
    )
    return 0
  }

  if (command === 'append-notes') {
    const plan = readJson(options.plan, fsImpl)
    const notesPath = required(options.notes, 'notes')
    const existingNotes = fsImpl.readFileSync(notesPath, 'utf8').trimEnd()
    writeText(
      notesPath,
      `${existingNotes}\n\n${renderDeploymentProvenanceNotes(plan, options['attestation-url'])}`,
      fsImpl,
    )
    return 0
  }

  if (command === 'stage-guide') {
    const plan = readJson(options.plan, fsImpl)
    stageVerificationGuide(
      {
        deploymentDir: options['deployment-dir'],
        guide: options.guide,
        plan,
      },
      fsImpl,
    )
    return 0
  }

  if (command === 'verify') {
    verifyDeploymentProvenance(normalizeVerificationOptions(options), {
      execFileSyncImpl: dependencies.execFileSyncImpl,
      fsImpl,
    })
    consoleObj.log('Deployment archive provenance verified.')
    return 0
  }

  throw new Error(USAGE)
}

/* v8 ignore next -- Direct execution delegates to the tested CLI adapter. */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
