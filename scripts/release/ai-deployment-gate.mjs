#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const AI_DEPLOYMENT_EVIDENCE_SCHEMA_VERSION = 1

const TOP_LEVEL_FIELDS = Object.freeze([
  'alerts',
  'connections',
  'egress',
  'environment',
  'guardActive',
  'intendedPath',
  'keyring',
  'models',
  'profiles',
  'restore',
  'schemaVersion',
  'secureDefaults',
  'syntheticProbe',
  'verificationMode',
])
const AI_PATH_FIELDS = Object.freeze([
  'adapterType',
  'aiConnectionId',
  'aiConnectionModelRevisionId',
  'aiRunProfileRevisionId',
])

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

function assertCount(value, context) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative safe integer.`)
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

  for (const field of ['connections', 'models', 'profiles']) {
    assertExactFields(
      evidence[field],
      ['intended', 'verified'],
      `evidence.${field}`,
    )
    assertCount(evidence[field].intended, `evidence.${field}.intended`)
    assertCount(evidence[field].verified, `evidence.${field}.verified`)
    if (evidence[field].verified > evidence[field].intended) {
      throw new Error(`evidence.${field}.verified cannot exceed intended.`)
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
    evidence.intendedPath,
    AI_PATH_FIELDS,
    'evidence.intendedPath',
  )
  for (const field of AI_PATH_FIELDS) {
    if (
      typeof evidence.intendedPath[field] !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,160}$/u.test(evidence.intendedPath[field])
    ) {
      throw new Error(`evidence.intendedPath.${field} is invalid.`)
    }
  }

  assertExactFields(
    evidence.syntheticProbe,
    [
      'adapterType',
      'aiConnectionId',
      'aiConnectionModelRevisionId',
      'aiRunProfileRevisionId',
      'externalLiveCallMade',
      'outcome',
      'payloadClassification',
    ],
    'evidence.syntheticProbe',
  )
  for (const field of AI_PATH_FIELDS) {
    if (
      typeof evidence.syntheticProbe[field] !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,160}$/u.test(evidence.syntheticProbe[field])
    ) {
      throw new Error(`evidence.syntheticProbe.${field} is invalid.`)
    }
  }
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
  for (const field of ['connections', 'models', 'profiles']) {
    if (
      evidence[field].intended === 0 ||
      evidence[field].verified !== evidence[field].intended
    ) {
      blockers.push(`${field}_unverified`)
    }
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
  if (
    AI_PATH_FIELDS.some(
      field => evidence.syntheticProbe[field] !== evidence.intendedPath[field],
    )
  ) {
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
      environment: evidence.environment,
      intendedConnections: evidence.connections.intended,
      intendedModels: evidence.models.intended,
      intendedProfiles: evidence.profiles.intended,
      probeAdapter: evidence.syntheticProbe.adapterType,
      probeOutcome: evidence.syntheticProbe.outcome,
      readyToRelease: result.readyToRelease,
      schemaVersion: result.schemaVersion,
      verificationMode: evidence.verificationMode,
      verifiedConnections: evidence.connections.verified,
      verifiedModels: evidence.models.verified,
      verifiedProfiles: evidence.profiles.verified,
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
  const source = fsImpl.readFileSync(options.evidencePath, 'utf8')
  if (Buffer.byteLength(source, 'utf8') > 64 * 1024) {
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
