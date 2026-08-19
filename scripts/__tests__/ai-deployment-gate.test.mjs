import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  assessAiDeploymentGate,
  formatAiDeploymentGateEvidence,
  main,
} from '../release/ai-deployment-gate.mjs'

function verifiedEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    environment: 'prodlike',
    verificationMode: 'prodlike',
    guardActive: true,
    keyring: {
      activeWriteVersionExplicit: true,
      requiredVersionsPresentOnEveryNode: true,
    },
    restore: {
      databaseAndKeyringRestoredTogether: true,
      providerSecretsAuthenticated: true,
    },
    egress: { deploymentPolicyEnforced: true },
    secureDefaults: {
      contentGatesVerified: true,
      privacyFloorVerified: true,
    },
    connections: { intended: 1, verified: 1 },
    models: { intended: 1, verified: 1 },
    profiles: { intended: 3, verified: 3 },
    alerts: {
      activeProfileBlocked: true,
      authenticationFailure: true,
      circuitBreakerOpened: true,
    },
    intendedPath: {
      adapterType: 'controlled_test',
      aiConnectionId: '10000000-0000-4000-8000-000000000001',
      aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
      aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000001',
    },
    syntheticProbe: {
      adapterType: 'controlled_test',
      aiConnectionId: '10000000-0000-4000-8000-000000000001',
      aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
      aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000001',
      externalLiveCallMade: false,
      outcome: 'completed',
      payloadClassification: 'synthetic',
    },
    ...overrides,
  }
}

function mutateEvidence(mutate) {
  const evidence = structuredClone(verifiedEvidence())
  mutate(evidence)
  return evidence
}

describe('AI deployment gate', () => {
  it('keeps the shipped production application configuration globally blocked', () => {
    const appEnv = readFileSync(
      'containers/production/env/app.env.template',
      'utf8',
    )

    expect(appEnv).toContain('AI_REQUIREMENT_GENERATION_DISABLED=1')
  })

  it('accepts complete content-free evidence while the global guard is active', () => {
    expect(assessAiDeploymentGate(verifiedEvidence())).toEqual({
      blockers: [],
      readyToRelease: true,
      schemaVersion: 1,
    })
  })

  it('fails closed on every missing pre-deployment condition', () => {
    const result = assessAiDeploymentGate(
      verifiedEvidence({
        alerts: {
          activeProfileBlocked: false,
          authenticationFailure: false,
          circuitBreakerOpened: false,
        },
        connections: { intended: 2, verified: 1 },
        egress: { deploymentPolicyEnforced: false },
        keyring: {
          activeWriteVersionExplicit: false,
          requiredVersionsPresentOnEveryNode: false,
        },
        models: { intended: 2, verified: 1 },
        profiles: { intended: 3, verified: 2 },
        restore: {
          databaseAndKeyringRestoredTogether: false,
          providerSecretsAuthenticated: false,
        },
        secureDefaults: {
          contentGatesVerified: false,
          privacyFloorVerified: false,
        },
      }),
    )

    expect(result.readyToRelease).toBe(false)
    expect(result.blockers).toEqual([
      'keyring_versions_missing',
      'keyring_active_write_version_implicit',
      'restore_pair_unverified',
      'restored_provider_secrets_unverified',
      'egress_policy_unverified',
      'content_gates_unverified',
      'privacy_floor_unverified',
      'connections_unverified',
      'models_unverified',
      'profiles_unverified',
      'authentication_alarm_unbound',
      'breaker_alarm_unbound',
      'blocked_profile_alarm_unbound',
    ])
  })

  it('accepts an opt-in staging-live probe on the exact intended path with only synthetic data', () => {
    const result = assessAiDeploymentGate(
      verifiedEvidence({
        environment: 'staging',
        intendedPath: {
          adapterType: 'openrouter',
          aiConnectionId: '10000000-0000-4000-8000-000000000002',
          aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000002',
          aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000002',
        },
        syntheticProbe: {
          adapterType: 'openrouter',
          aiConnectionId: '10000000-0000-4000-8000-000000000002',
          aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000002',
          aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000002',
          externalLiveCallMade: true,
          outcome: 'completed',
          payloadClassification: 'synthetic',
        },
        verificationMode: 'staging_live',
      }),
    )

    expect(result).toMatchObject({ blockers: [], readyToRelease: true })
  })

  it('accepts production pre-deployment evidence without making a live authoring call', () => {
    const result = assessAiDeploymentGate(
      verifiedEvidence({
        environment: 'production',
        syntheticProbe: {
          ...verifiedEvidence().syntheticProbe,
          adapterType: 'openrouter',
          externalLiveCallMade: false,
          outcome: 'not_run',
          payloadClassification: 'none',
        },
        intendedPath: {
          ...verifiedEvidence().intendedPath,
          adapterType: 'openrouter',
        },
        verificationMode: 'production',
      }),
    )

    expect(result).toMatchObject({ blockers: [], readyToRelease: true })
  })

  it('rejects prodlike external calls and staging-live path or data mismatches', () => {
    const result = assessAiDeploymentGate(
      verifiedEvidence({
        syntheticProbe: {
          adapterType: 'openrouter',
          aiConnectionId: '10000000-0000-4000-8000-000000000999',
          aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000999',
          aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000999',
          externalLiveCallMade: true,
          outcome: 'completed',
          payloadClassification: 'none',
        },
      }),
    )

    expect(result.blockers).toContain('prodlike_probe_not_controlled')
    expect(result.blockers).toContain('prodlike_probe_external_call')
    expect(result.blockers).toContain('synthetic_probe_path_mismatch')
    expect(result.blockers).toContain('synthetic_probe_data_not_synthetic')
  })

  it('formats evidence without accepting content or configuration fields', () => {
    expect(() =>
      assessAiDeploymentGate({
        ...verifiedEvidence(),
        prompt: 'must never enter deployment evidence',
      }),
    ).toThrow('Unknown AI deployment evidence field: prompt')

    expect(formatAiDeploymentGateEvidence(verifiedEvidence())).not.toMatch(
      /prompt|endpoint|secret|image|model output/iu,
    )
  })

  it.each([
    ['object', null, 'evidence must be an object'],
    [
      'missing field',
      mutateEvidence(evidence => delete evidence.alerts),
      'Missing AI deployment evidence field',
    ],
    [
      'schema',
      mutateEvidence(evidence => {
        evidence.schemaVersion = 2
      }),
      'Unsupported AI deployment evidence schema',
    ],
    [
      'environment',
      mutateEvidence(evidence => {
        evidence.environment = 'test'
      }),
      'evidence.environment must be',
    ],
    [
      'mode',
      mutateEvidence(evidence => {
        evidence.verificationMode = 'live'
      }),
      'evidence.verificationMode must be',
    ],
    [
      'environment mode pair',
      mutateEvidence(evidence => {
        evidence.environment = 'staging'
      }),
      'does not match evidence.verificationMode',
    ],
    [
      'boolean',
      mutateEvidence(evidence => {
        evidence.guardActive = 'yes'
      }),
      'evidence.guardActive must be boolean',
    ],
    [
      'count',
      mutateEvidence(evidence => {
        evidence.connections.intended = -1
      }),
      'non-negative safe integer',
    ],
    [
      'over-verified count',
      mutateEvidence(evidence => {
        evidence.models.verified = 2
      }),
      'verified cannot exceed intended',
    ],
    [
      'intended path',
      mutateEvidence(evidence => {
        evidence.intendedPath.adapterType = 'unsafe path'
      }),
      'evidence.intendedPath.adapterType is invalid',
    ],
    [
      'probe path',
      mutateEvidence(evidence => {
        evidence.syntheticProbe.aiConnectionId = ''
      }),
      'evidence.syntheticProbe.aiConnectionId is invalid',
    ],
    [
      'probe outcome',
      mutateEvidence(evidence => {
        evidence.syntheticProbe.outcome = 'unknown'
      }),
      'outcome must be completed, failed, or not_run',
    ],
    [
      'payload classification',
      mutateEvidence(evidence => {
        evidence.syntheticProbe.payloadClassification = 'production'
      }),
      'payloadClassification must be synthetic or none',
    ],
  ])('rejects invalid %s evidence', (_name, evidence, message) => {
    expect(() => assessAiDeploymentGate(evidence)).toThrow(message)
  })

  it('reports mode-specific blockers', () => {
    const staging = mutateEvidence(evidence => {
      evidence.environment = 'staging'
      evidence.verificationMode = 'staging_live'
    })
    expect(assessAiDeploymentGate(staging).blockers).toContain(
      'staging_live_probe_not_executed',
    )

    const production = mutateEvidence(evidence => {
      evidence.environment = 'production'
      evidence.verificationMode = 'production'
      evidence.syntheticProbe.externalLiveCallMade = true
    })
    expect(assessAiDeploymentGate(production).blockers).toContain(
      'production_authoring_probe_forbidden',
    )

    const failed = mutateEvidence(evidence => {
      evidence.guardActive = false
      evidence.syntheticProbe.outcome = 'failed'
    })
    expect(assessAiDeploymentGate(failed).blockers).toEqual(
      expect.arrayContaining([
        'global_guard_not_active',
        'synthetic_probe_failed',
      ]),
    )
  })

  it('runs the bounded command-line gate for help, ready, and blocked evidence', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    expect(main({ args: ['--help'] })).toBe(0)
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Usage:'))

    const fsImpl = {
      readFileSync: vi.fn(() => JSON.stringify(verifiedEvidence())),
    }
    expect(
      main({ args: ['verify', '--evidence', '/evidence.json'], fsImpl }),
    ).toBe(0)
    fsImpl.readFileSync.mockReturnValue(
      JSON.stringify(verifiedEvidence({ guardActive: false })),
    )
    expect(
      main({ args: ['verify', '--evidence', '/evidence.json'], fsImpl }),
    ).toBe(1)
    expect(() => main({ args: ['verify'] })).toThrow('Usage:')
    fsImpl.readFileSync.mockReturnValue('x'.repeat(64 * 1024 + 1))
    expect(() =>
      main({ args: ['verify', '--evidence', '/evidence.json'], fsImpl }),
    ).toThrow('exceeds 64 KiB')
    stdout.mockRestore()
  })
})
