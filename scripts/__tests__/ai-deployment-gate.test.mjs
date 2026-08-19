import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  assessAiDeploymentGate,
  formatAiDeploymentGateEvidence,
  main,
} from '../release/ai-deployment-gate.mjs'

const REQUIRED_CHECK_AXES = [
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
]

const CONTROLLED_PATH = {
  adapterType: 'controlled_test',
  aiConnectionId: '10000000-0000-4000-8000-000000000001',
  aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
  aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000001',
}

function checkEvidence(axis) {
  return {
    axis,
    evidenceId: `evidence-${axis}`,
    outcome: 'passed',
    suiteVersion: 'v3',
  }
}

function verifiedEvidence(overrides = {}) {
  return {
    schemaVersion: 2,
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
    inventory: {
      intendedPaths: [CONTROLLED_PATH],
      verifiedPaths: [CONTROLLED_PATH],
    },
    checks: REQUIRED_CHECK_AXES.map(checkEvidence),
    alerts: {
      activeProfileBlocked: true,
      authenticationFailure: true,
      circuitBreakerOpened: true,
    },
    syntheticProbe: {
      ...CONTROLLED_PATH,
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
      schemaVersion: 2,
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
        egress: { deploymentPolicyEnforced: false },
        inventory: {
          intendedPaths: [
            CONTROLLED_PATH,
            {
              ...CONTROLLED_PATH,
              aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000002',
            },
          ],
          verifiedPaths: [CONTROLLED_PATH],
        },
        keyring: {
          activeWriteVersionExplicit: false,
          requiredVersionsPresentOnEveryNode: false,
        },
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
      'intended_paths_unverified',
      'authentication_alarm_unbound',
      'breaker_alarm_unbound',
      'blocked_profile_alarm_unbound',
    ])
  })

  it('accepts an opt-in staging-live probe on the exact intended path with only synthetic data', () => {
    const intendedPath = {
      adapterType: 'openrouter',
      aiConnectionId: '10000000-0000-4000-8000-000000000002',
      aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000002',
      aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000002',
    }
    const result = assessAiDeploymentGate(
      verifiedEvidence({
        environment: 'staging',
        inventory: {
          intendedPaths: [intendedPath],
          verifiedPaths: [intendedPath],
        },
        syntheticProbe: {
          ...intendedPath,
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
    const productionPath = { ...CONTROLLED_PATH, adapterType: 'openrouter' }
    const result = assessAiDeploymentGate(
      verifiedEvidence({
        environment: 'production',
        inventory: {
          intendedPaths: [productionPath],
          verifiedPaths: [productionPath],
        },
        syntheticProbe: {
          ...verifiedEvidence().syntheticProbe,
          adapterType: 'openrouter',
          externalLiveCallMade: false,
          outcome: 'not_run',
          payloadClassification: 'none',
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
    [
      'missing',
      evidence => {
        evidence.inventory.verifiedPaths = []
      },
    ],
    [
      'swapped',
      evidence => {
        evidence.inventory.verifiedPaths[0] = {
          ...CONTROLLED_PATH,
          aiConnectionId: CONTROLLED_PATH.aiConnectionModelRevisionId,
          aiConnectionModelRevisionId: CONTROLLED_PATH.aiConnectionId,
        }
      },
    ],
    [
      'duplicate',
      evidence => {
        evidence.inventory.verifiedPaths.push(CONTROLLED_PATH)
      },
    ],
    [
      'extra',
      evidence => {
        evidence.inventory.verifiedPaths.push({
          ...CONTROLLED_PATH,
          aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000099',
        })
      },
    ],
  ])('rejects %s verified path evidence', (_name, mutate) => {
    const evidence = mutateEvidence(mutate)
    if (_name === 'duplicate') {
      expect(() => assessAiDeploymentGate(evidence)).toThrow(
        'evidence.inventory.verifiedPaths must not contain duplicates',
      )
      return
    }
    expect(assessAiDeploymentGate(evidence).blockers).toContain(
      'intended_paths_unverified',
    )
  })

  it('requires one versioned content-free proof for every release-check axis', () => {
    const missing = mutateEvidence(evidence => {
      evidence.checks = evidence.checks.filter(check => check.axis !== 'sse')
    })
    expect(assessAiDeploymentGate(missing).blockers).toContain(
      'required_checks_unverified',
    )

    const duplicate = mutateEvidence(evidence => {
      evidence.checks.push(checkEvidence('security'))
    })
    expect(() => assessAiDeploymentGate(duplicate)).toThrow(
      'evidence.checks must not contain duplicate axes',
    )

    const extra = mutateEvidence(evidence => {
      evidence.checks.push(checkEvidence('provider_specific_route'))
    })
    expect(() => assessAiDeploymentGate(extra)).toThrow(
      'evidence.checks[12].axis is invalid',
    )

    const failed = mutateEvidence(evidence => {
      evidence.checks[0].outcome = 'failed'
    })
    expect(assessAiDeploymentGate(failed).blockers).toContain(
      'required_checks_unverified',
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
        evidence.schemaVersion = 1
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
      'intended path',
      mutateEvidence(evidence => {
        evidence.inventory.intendedPaths[0].adapterType = 'unsafe path'
      }),
      'evidence.inventory.intendedPaths[0].adapterType is invalid',
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
