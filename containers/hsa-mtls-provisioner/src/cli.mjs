#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ProvisionerError } from './errors.mjs'
import { loadCertificateProfile } from './profile.mjs'
import {
  ensureGeneration,
  finalizeGeneration,
  inspectGeneration,
  materializeSelectedGeneration,
  promoteGeneration,
  rollbackGeneration,
  rotateTrustDomain,
  stageGeneration,
  verifyGenerationDirectory,
} from './provisioner.mjs'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DEFAULT_PROFILE_PATH = path.resolve(
  packageDir,
  '../hsa-mtls/certificate-profile.json',
)

function readOption(args, name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new ProvisionerError('ARGUMENT_INVALID', `${name} requires a value`)
  }
  args.splice(index, 2)
  return value
}

export function parseCli(argv, env = process.env) {
  const args = [...argv]
  const command = args.shift()
  const includeProbes = args.includes('--include-probes')
  if (includeProbes) args.splice(args.indexOf('--include-probes'), 1)
  const options = {
    includeProbes:
      includeProbes || env.HSA_MTLS_INCLUDE_PROBES?.trim() === 'true',
    issuerRoot: readOption(
      args,
      '--issuer-root',
      env.HSA_MTLS_ISSUER_ROOT ?? '/run/kravhantering/hsa-mtls-issuer',
    ),
    lifetime: readOption(
      args,
      '--lifetime',
      env.HSA_MTLS_LIFETIME ?? 'persistent',
    ),
    profilePath: readOption(
      args,
      '--profile',
      env.HSA_MTLS_PROFILE_PATH ?? DEFAULT_PROFILE_PATH,
    ),
    rootDir: readOption(
      args,
      '--root',
      env.HSA_MTLS_GENERATIONS_ROOT ?? '/var/lib/kravhantering/hsa-mtls',
    ),
    runtimeRoot: readOption(
      args,
      '--runtime-root',
      env.HSA_MTLS_RUNTIME_ROOT ?? '/run/kravhantering/hsa-mtls-runtime',
    ),
  }
  return { args, command, options }
}

async function run(argv = process.argv.slice(2)) {
  const { args, command, options } = parseCli(argv)
  const finalizeGenerationId = command === 'finalize' ? args.shift() : undefined
  if (
    command === 'finalize' &&
    (!finalizeGenerationId || finalizeGenerationId.startsWith('--'))
  ) {
    throw new ProvisionerError(
      'ARGUMENT_INVALID',
      'finalize requires the authenticated generation ID',
    )
  }
  const profile = await loadCertificateProfile(options.profilePath)
  let result
  switch (command) {
    case 'activate':
      await ensureGeneration({ ...options, profile })
      result = await materializeSelectedGeneration({ ...options, profile })
      break
    case 'deploy':
      result = await materializeSelectedGeneration({ ...options, profile })
      break
    case 'ensure':
      result = await ensureGeneration({ ...options, profile })
      break
    case 'inspect':
      result = await inspectGeneration({ profile, rootDir: options.rootDir })
      break
    case 'verify': {
      const inspected = await inspectGeneration({
        profile,
        rootDir: options.rootDir,
      })
      const generationId = args.shift() ?? inspected.selection.current
      if (!generationId)
        throw new ProvisionerError(
          'SELECTION_INVALID',
          'No generation was selected',
        )
      result = await verifyGenerationDirectory({
        generationDir: path.join(options.rootDir, 'generations', generationId),
        profile,
      })
      break
    }
    case 'stage': {
      const domain = args.shift() ?? 'all'
      result = await stageGeneration({
        ...options,
        profile,
        rotateTrustDomains:
          domain === 'all' ? Object.keys(profile.trustDomains) : [domain],
        sourceGenerationId: readOption(args, '--from', null),
      })
      break
    }
    case 'promote':
      result = await promoteGeneration({
        generationId: args.shift(),
        profile,
        rootDir: options.rootDir,
      })
      break
    case 'rotate':
      result = await rotateTrustDomain({
        ...options,
        profile,
        trustDomain: args.shift(),
      })
      break
    case 'rollback':
      result = await rollbackGeneration({ profile, rootDir: options.rootDir })
      break
    case 'finalize':
      result = await finalizeGeneration({
        expectedGenerationId: finalizeGenerationId,
        profile,
        rootDir: options.rootDir,
      })
      break
    default:
      throw new ProvisionerError(
        'ARGUMENT_INVALID',
        'Command must be activate, deploy, ensure, inspect, verify, stage, promote, rotate, rollback, or finalize',
      )
  }
  if (args.length > 0)
    throw new ProvisionerError(
      'ARGUMENT_INVALID',
      'Unexpected command arguments',
    )
  process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(error => {
    const category =
      error instanceof ProvisionerError ? error.category : 'PROVISIONER_FAILED'
    process.stderr.write(`${JSON.stringify({ category, ok: false })}\n`)
    process.exitCode = 1
  })
}
