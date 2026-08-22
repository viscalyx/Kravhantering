#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const AI_DEPLOYMENT_EVIDENCE_SCHEMA_VERSION = 3

export const AI_DEPLOYMENT_REQUIRED_CHECK_AXES = Object.freeze([
  'adapter_contract',
  'security',
  'sql',
  'routes',
  'sse',
  'playwright_dev',
  'playwright_prodlike',
  'manual',
  'required_seed',
  'demo_seed',
  'recovery_rotation',
  'deployment_rollback',
])

const MAX_INTENDED_PATHS = 3

const TOP_LEVEL_FIELDS = Object.freeze([
  'alerts',
  'checks',
  'egress',
  'environment',
  'guardActive',
  'inventory',
  'keyring',
  'liveExecutionProof',
  'restore',
  'schemaVersion',
  'secureDefaults',
  'syntheticProbe',
  'verificationMode',
])
const AI_PATH_FIELDS = Object.freeze([
  'adapterType',
  'adapterVersion',
  'aiConnectionId',
  'aiConnectionModelRevisionId',
  'aiRunProfileConfigurationVersion',
  'aiRunProfileId',
  'connectionRevisionToken',
  'modelRevisionToken',
  'profileToken',
])
const LIVE_EXECUTION_PROOF_FIELDS = Object.freeze([
  ...AI_PATH_FIELDS,
  'executionId',
  'externalLiveCallMade',
  'failureCategory',
  'outcome',
  'testSuiteVersion',
])
const FIXED_LIVE_SUITE_VERSION = 'ai-admin-functional-probe-v1'

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertExactFields(record, fields, context) {
  if (!isRecord(record)) throw new Error(`${context} must be an object.`)
  const allowed = new Set(fields)
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      throw new Error(`Unknown AI deployment evidence field: ${field}`)
    }
  }
  for (const field of fields) {
    if (!(field in record)) {
      throw new Error(
        `Missing AI deployment evidence field: ${context}.${field}`,
      )
    }
  }
}

function assertBoolean(value, context) {
  if (typeof value !== 'boolean') throw new Error(`${context} must be boolean.`)
}

function pathKey(path) {
  return AI_PATH_FIELDS.map(field => path[field]).join('\u0000')
}

function validatePath(path, context) {
  assertExactFields(path, AI_PATH_FIELDS, context)
  for (const field of AI_PATH_FIELDS) {
    if (field === 'aiRunProfileConfigurationVersion') {
      if (
        !Number.isSafeInteger(path[field]) ||
        path[field] < 1 ||
        path[field] > 2_147_483_647
      ) {
        throw new Error(`${context}.${field} is invalid.`)
      }
      continue
    }
    if (
      typeof path[field] !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,160}$/u.test(path[field])
    ) {
      throw new Error(`${context}.${field} is invalid.`)
    }
  }
}

function validatePathArray(paths, context, minimum = 1) {
  if (
    !Array.isArray(paths) ||
    paths.length < minimum ||
    paths.length > MAX_INTENDED_PATHS
  ) {
    throw new Error(
      `${context} must contain between ${minimum} and ${MAX_INTENDED_PATHS} paths.`,
    )
  }
  const keys = new Set()
  for (const [index, path] of paths.entries()) {
    validatePath(path, `${context}[${index}]`)
    const key = pathKey(path)
    if (keys.has(key)) {
      throw new Error(`${context} must not contain duplicates.`)
    }
    keys.add(key)
  }
  return keys
}

function validateLiveExecutionProof(proof, context) {
  assertExactFields(proof, LIVE_EXECUTION_PROOF_FIELDS, context)
  validatePath(
    Object.fromEntries(AI_PATH_FIELDS.map(field => [field, proof[field]])),
    context,
  )
  if (
    typeof proof.executionId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,160}$/u.test(proof.executionId)
  ) {
    throw new Error(`${context}.executionId is invalid.`)
  }
  assertBoolean(proof.externalLiveCallMade, `${context}.externalLiveCallMade`)
  if (
    proof.failureCategory !== null &&
    (typeof proof.failureCategory !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,160}$/u.test(proof.failureCategory))
  ) {
    throw new Error(`${context}.failureCategory is invalid.`)
  }
  if (!['failed', 'passed'].includes(proof.outcome)) {
    throw new Error(`${context}.outcome must be failed or passed.`)
  }
  if (
    typeof proof.testSuiteVersion !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,160}$/u.test(proof.testSuiteVersion)
  ) {
    throw new Error(`${context}.testSuiteVersion is invalid.`)
  }
}

function validateEvidence(evidence) {
  assertExactFields(evidence, TOP_LEVEL_FIELDS, 'evidence')
  if (evidence.schemaVersion !== AI_DEPLOYMENT_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported AI deployment evidence schema: ${String(evidence.schemaVersion)}`,
    )
  }
  if (!['production', 'prodlike', 'staging'].includes(evidence.environment)) {
    throw new Error(
      'evidence.environment must be production, prodlike, or staging.',
    )
  }
  if (
    !['production', 'prodlike', 'staging_live'].includes(
      evidence.verificationMode,
    )
  ) {
    throw new Error(
      'evidence.verificationMode must be production, prodlike, or staging_live.',
    )
  }
  const expectedEnvironment =
    evidence.verificationMode === 'staging_live'
      ? 'staging'
      : evidence.verificationMode
  if (evidence.environment !== expectedEnvironment) {
    throw new Error(
      'evidence.environment does not match evidence.verificationMode.',
    )
  }
  assertBoolean(evidence.guardActive, 'evidence.guardActive')

  assertExactFields(
    evidence.keyring,
    ['activeWriteVersionExplicit', 'requiredVersionsPresentOnEveryNode'],
    'evidence.keyring',
  )
  assertBoolean(
    evidence.keyring.activeWriteVersionExplicit,
    'evidence.keyring.activeWriteVersionExplicit',
  )
  assertBoolean(
    evidence.keyring.requiredVersionsPresentOnEveryNode,
    'evidence.keyring.requiredVersionsPresentOnEveryNode',
  )

  assertExactFields(
    evidence.restore,
    ['databaseAndKeyringRestoredTogether', 'providerSecretsAuthenticated'],
    'evidence.restore',
  )
  assertBoolean(
    evidence.restore.databaseAndKeyringRestoredTogether,
    'evidence.restore.databaseAndKeyringRestoredTogether',
  )
  assertBoolean(
    evidence.restore.providerSecretsAuthenticated,
    'evidence.restore.providerSecretsAuthenticated',
  )

  assertExactFields(
    evidence.egress,
    ['deploymentPolicyEnforced'],
    'evidence.egress',
  )
  assertBoolean(
    evidence.egress.deploymentPolicyEnforced,
    'evidence.egress.deploymentPolicyEnforced',
  )

  assertExactFields(
    evidence.secureDefaults,
    ['contentGatesVerified', 'privacyFloorVerified'],
    'evidence.secureDefaults',
  )
  assertBoolean(
    evidence.secureDefaults.contentGatesVerified,
    'evidence.secureDefaults.contentGatesVerified',
  )
  assertBoolean(
    evidence.secureDefaults.privacyFloorVerified,
    'evidence.secureDefaults.privacyFloorVerified',
  )

  assertExactFields(
    evidence.inventory,
    ['intendedPaths', 'verifiedPaths'],
    'evidence.inventory',
  )
  validatePathArray(
    evidence.inventory.intendedPaths,
    'evidence.inventory.intendedPaths',
  )

  if (evidence.verificationMode === 'staging_live') {
    if (
      !Array.isArray(evidence.liveExecutionProof) ||
      evidence.liveExecutionProof.length < 1 ||
      evidence.liveExecutionProof.length > MAX_INTENDED_PATHS
    ) {
      throw new Error(
        `evidence.liveExecutionProof must contain between 1 and ${MAX_INTENDED_PATHS} proofs.`,
      )
    }
    const proofKeys = new Set()
    for (const [index, proof] of evidence.liveExecutionProof.entries()) {
      validateLiveExecutionProof(proof, `evidence.liveExecutionProof[${index}]`)
      const key = pathKey(proof)
      if (proofKeys.has(key)) {
        throw new Error(
          'evidence.liveExecutionProof must not contain duplicates.',
        )
      }
      proofKeys.add(key)
    }
  } else if (evidence.liveExecutionProof !== null) {
    throw new Error(
      'evidence.liveExecutionProof must be null outside staging_live.',
    )
  }
  validatePathArray(
    evidence.inventory.verifiedPaths,
    'evidence.inventory.verifiedPaths',
    0,
  )

  if (!Array.isArray(evidence.checks) || evidence.checks.length > 32) {
    throw new Error('evidence.checks must be an array with at most 32 items.')
  }
  const requiredAxes = new Set(AI_DEPLOYMENT_REQUIRED_CHECK_AXES)
  const seenAxes = new Set()
  for (const [index, check] of evidence.checks.entries()) {
    const context = `evidence.checks[${index}]`
    assertExactFields(
      check,
      ['axis', 'evidenceId', 'outcome', 'suiteVersion'],
      context,
    )
    if (!requiredAxes.has(check.axis)) {
      throw new Error(`${context}.axis is invalid.`)
    }
    if (seenAxes.has(check.axis)) {
      throw new Error('evidence.checks must not contain duplicate axes.')
    }
    seenAxes.add(check.axis)
    for (const field of ['evidenceId', 'suiteVersion']) {
      if (
        typeof check[field] !== 'string' ||
        !/^[A-Za-z0-9._:-]{1,160}$/u.test(check[field])
      ) {
        throw new Error(`${context}.${field} is invalid.`)
      }
    }
    if (!['failed', 'passed'].includes(check.outcome)) {
      throw new Error(`${context}.outcome must be failed or passed.`)
    }
  }

  assertExactFields(
    evidence.alerts,
    ['activeProfileBlocked', 'authenticationFailure', 'circuitBreakerOpened'],
    'evidence.alerts',
  )
  for (const field of Object.keys(evidence.alerts)) {
    assertBoolean(evidence.alerts[field], `evidence.alerts.${field}`)
  }

  assertExactFields(
    evidence.syntheticProbe,
    [
      ...AI_PATH_FIELDS,
      'externalLiveCallMade',
      'outcome',
      'payloadClassification',
    ],
    'evidence.syntheticProbe',
  )
  validatePath(
    Object.fromEntries(
      AI_PATH_FIELDS.map(field => [field, evidence.syntheticProbe[field]]),
    ),
    'evidence.syntheticProbe',
  )
  assertBoolean(
    evidence.syntheticProbe.externalLiveCallMade,
    'evidence.syntheticProbe.externalLiveCallMade',
  )
  if (
    !['completed', 'failed', 'not_run'].includes(
      evidence.syntheticProbe.outcome,
    )
  ) {
    throw new Error(
      'evidence.syntheticProbe.outcome must be completed, failed, or not_run.',
    )
  }
  if (
    !['synthetic', 'none'].includes(
      evidence.syntheticProbe.payloadClassification,
    )
  ) {
    throw new Error(
      'evidence.syntheticProbe.payloadClassification must be synthetic or none.',
    )
  }
}

export function assessAiDeploymentGate(evidence) {
  validateEvidence(evidence)
  const blockers = []
  if (!evidence.guardActive) blockers.push('global_guard_not_active')
  if (!evidence.keyring.requiredVersionsPresentOnEveryNode) {
    blockers.push('keyring_versions_missing')
  }
  if (!evidence.keyring.activeWriteVersionExplicit) {
    blockers.push('keyring_active_write_version_implicit')
  }
  if (!evidence.restore.databaseAndKeyringRestoredTogether) {
    blockers.push('restore_pair_unverified')
  }
  if (!evidence.restore.providerSecretsAuthenticated) {
    blockers.push('restored_provider_secrets_unverified')
  }
  if (!evidence.egress.deploymentPolicyEnforced) {
    blockers.push('egress_policy_unverified')
  }
  if (!evidence.secureDefaults.contentGatesVerified) {
    blockers.push('content_gates_unverified')
  }
  if (!evidence.secureDefaults.privacyFloorVerified) {
    blockers.push('privacy_floor_unverified')
  }
  const intendedPathKeys = new Set(
    evidence.inventory.intendedPaths.map(pathKey),
  )
  const verifiedPathKeys = new Set(
    evidence.inventory.verifiedPaths.map(pathKey),
  )
  if (evidence.verificationMode === 'staging_live') {
    const liveProofs = evidence.liveExecutionProof
    const livePathKeys = new Set(liveProofs.map(pathKey))
    if (
      livePathKeys.size !== intendedPathKeys.size ||
      [...intendedPathKeys].some(key => !livePathKeys.has(key))
    ) {
      blockers.push('staging_live_execution_path_mismatch')
    }
    if (liveProofs.some(proof => proof.adapterType === 'controlled_test')) {
      blockers.push('staging_live_controlled_adapter_forbidden')
    }
    if (liveProofs.some(proof => !proof.externalLiveCallMade)) {
      blockers.push('staging_live_probe_not_executed')
    }
    if (
      liveProofs.some(
        proof =>
          proof.outcome !== 'passed' ||
          proof.failureCategory !== null ||
          proof.testSuiteVersion !== FIXED_LIVE_SUITE_VERSION,
      )
    ) {
      blockers.push('staging_live_execution_unverified')
    }
  }
  if (
    intendedPathKeys.size !== verifiedPathKeys.size ||
    [...intendedPathKeys].some(key => !verifiedPathKeys.has(key))
  ) {
    blockers.push('intended_paths_unverified')
  }
  const checksByAxis = new Map(
    evidence.checks.map(check => [check.axis, check]),
  )
  if (
    AI_DEPLOYMENT_REQUIRED_CHECK_AXES.some(
      axis => checksByAxis.get(axis)?.outcome !== 'passed',
    )
  ) {
    blockers.push('required_checks_unverified')
  }
  if (!evidence.alerts.authenticationFailure) {
    blockers.push('authentication_alarm_unbound')
  }
  if (!evidence.alerts.circuitBreakerOpened) {
    blockers.push('breaker_alarm_unbound')
  }
  if (!evidence.alerts.activeProfileBlocked) {
    blockers.push('blocked_profile_alarm_unbound')
  }
  if (!intendedPathKeys.has(pathKey(evidence.syntheticProbe))) {
    blockers.push('synthetic_probe_path_mismatch')
  }
  if (
    evidence.verificationMode === 'prodlike' &&
    evidence.syntheticProbe.adapterType !== 'controlled_test'
  ) {
    blockers.push('prodlike_probe_not_controlled')
  }
  if (
    evidence.verificationMode === 'prodlike' &&
    evidence.syntheticProbe.externalLiveCallMade
  ) {
    blockers.push('prodlike_probe_external_call')
  }
  if (
    evidence.verificationMode === 'staging_live' &&
    !evidence.syntheticProbe.externalLiveCallMade
  ) {
    blockers.push('staging_live_probe_not_executed')
  }
  if (
    evidence.verificationMode !== 'production' &&
    evidence.syntheticProbe.payloadClassification !== 'synthetic'
  ) {
    blockers.push('synthetic_probe_data_not_synthetic')
  }
  if (
    evidence.verificationMode === 'production' &&
    (evidence.syntheticProbe.externalLiveCallMade ||
      evidence.syntheticProbe.payloadClassification !== 'none' ||
      evidence.syntheticProbe.outcome !== 'not_run')
  ) {
    blockers.push('production_authoring_probe_forbidden')
  }
  if (
    evidence.verificationMode !== 'production' &&
    evidence.syntheticProbe.outcome !== 'completed'
  ) {
    blockers.push('synthetic_probe_failed')
  }

  return Object.freeze({
    blockers: Object.freeze(blockers),
    readyToRelease: blockers.length === 0,
    schemaVersion: AI_DEPLOYMENT_EVIDENCE_SCHEMA_VERSION,
  })
}

export function formatAiDeploymentGateEvidence(evidence) {
  const result = assessAiDeploymentGate(evidence)
  return `${JSON.stringify(
    {
      blockers: result.blockers,
      checksPassed: evidence.checks.filter(check => check.outcome === 'passed')
        .length,
      environment: evidence.environment,
      intendedPaths: evidence.inventory.intendedPaths.length,
      probeAdapter: evidence.syntheticProbe.adapterType,
      probeOutcome: evidence.syntheticProbe.outcome,
      readyToRelease: result.readyToRelease,
      schemaVersion: result.schemaVersion,
      verificationMode: evidence.verificationMode,
      verifiedPaths: evidence.inventory.verifiedPaths.length,
    },
    null,
    2,
  )}\n`
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const [command, evidenceFlag, evidencePath, ...rest] = args
  if (
    command !== 'verify' ||
    evidenceFlag !== '--evidence' ||
    !evidencePath ||
    rest.length > 0
  ) {
    throw new Error(
      'Usage: node scripts/release/ai-deployment-gate.mjs verify --evidence <path>',
    )
  }
  return { command, evidencePath, help: false }
}

export function main({ args = process.argv.slice(2), fsImpl = fs } = {}) {
  const options = parseArgs(args)
  if (options.help) {
    process.stdout.write(
      'Usage: node scripts/release/ai-deployment-gate.mjs verify --evidence <path>\n',
    )
    return 0
  }
  const maximumEvidenceBytes = 64 * 1024
  const stat = fsImpl.statSync(options.evidencePath)
  if (typeof stat.size === 'number' && stat.size > maximumEvidenceBytes) {
    throw new Error('AI deployment evidence exceeds 64 KiB.')
  }
  const source = fsImpl.readFileSync(options.evidencePath, 'utf8')
  if (Buffer.byteLength(source, 'utf8') > maximumEvidenceBytes) {
    throw new Error('AI deployment evidence exceeds 64 KiB.')
  }
  const evidence = JSON.parse(source)
  const report = assessAiDeploymentGate(evidence)
  process.stdout.write(formatAiDeploymentGateEvidence(evidence))
  return report.readyToRelease ? 0 : 1
}

/* v8 ignore start -- process-only CLI entrypoint */
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stderr.write(
      `ai-deployment-gate: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
/* v8 ignore stop */
