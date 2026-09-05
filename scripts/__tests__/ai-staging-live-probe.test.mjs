import { afterEach, describe, expect, it, vi } from 'vitest'
import { assessAiDeploymentGate } from '../release/ai-deployment-gate.mjs'
import {
  main,
  runAiStagingLiveSyntheticProbe,
  stagingLiveProbeConfiguration,
} from '../release/ai-staging-live-probe.mjs'

const ADMIN_PROBE_VERSION = 'ai-admin-functional-probe-v2'
const PATH = Object.freeze({
  adapterType: 'openrouter',
  aiConnectionId: '10000000-0000-4000-8000-000000000001',
  aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: '30000000-0000-4000-8000-000000000001',
})
const SECOND_PROFILE_REVISION_ID = '30000000-0000-4000-8000-000000000002'
const CONFIGURED_PATHS = Object.freeze([
  Object.freeze({ ...PATH, profileKey: 'generation_without_images' }),
  Object.freeze({
    adapterType: 'openrouter',
    aiConnectionId: '10000000-0000-4000-8000-000000000002',
    aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000002',
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: SECOND_PROFILE_REVISION_ID,
    profileKey: 'generation_with_images',
  }),
  Object.freeze({
    adapterType: 'openrouter',
    aiConnectionId: '10000000-0000-4000-8000-000000000003',
    aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000003',
    aiRunProfileConfigurationVersion: 1,
    aiRunProfileId: '30000000-0000-4000-8000-000000000003',
    profileKey: 'invalid_json_repair',
  }),
])
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
const LIVE_PROOF = Object.freeze({
  adapterType: PATH.adapterType,
  adapterVersion: '1',
  aiConnectionId: PATH.aiConnectionId,
  aiConnectionModelRevisionId: PATH.aiConnectionModelRevisionId,
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: PATH.aiRunProfileId,
  connectionRevisionToken: '40000000-0000-4000-8000-000000000001',
  executionId: '50000000-0000-4000-8000-000000000001',
  externalLiveCallMade: true,
  failureCategory: null,
  modelRevisionToken: '60000000-0000-4000-8000-000000000001',
  outcome: 'passed',
  profileToken: '70000000-0000-4000-8000-000000000001',
  testSuiteVersion: ADMIN_PROBE_VERSION,
})
const VERIFIED_PATH = Object.freeze({
  adapterType: LIVE_PROOF.adapterType,
  adapterVersion: LIVE_PROOF.adapterVersion,
  aiConnectionId: LIVE_PROOF.aiConnectionId,
  aiConnectionModelRevisionId: LIVE_PROOF.aiConnectionModelRevisionId,
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: LIVE_PROOF.aiRunProfileId,
  connectionRevisionToken: LIVE_PROOF.connectionRevisionToken,
  modelRevisionToken: LIVE_PROOF.modelRevisionToken,
  profileToken: LIVE_PROOF.profileToken,
})

function configuration(overrides = {}) {
  return {
    baseUrl: 'https://staging.example.test',
    cookie: 'kravhantering_session=opaque-session',
    expectedEnvironmentId: 'staging-eu-test',
    intendedPaths: [CONFIGURED_PATHS[0]],
    ...overrides,
  }
}

function configuredEnv(overrides = {}) {
  return {
    AI_STAGING_LIVE_BASE_URL: 'https://staging.example.test/path?query=value',
    AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID: 'staging-eu-test',
    AI_STAGING_LIVE_PATHS_FILE: '/private/staging-paths.json',
    AI_STAGING_LIVE_SESSION_COOKIE_FILE: '/private/session-cookie',
    AI_STAGING_LIVE_SYNTHETIC_PROBE: '1',
    ...overrides,
  }
}

function privateCookieFile(overrides = {}) {
  return {
    readFileSync: vi.fn(path =>
      path === '/private/staging-paths.json'
        ? JSON.stringify(CONFIGURED_PATHS)
        : 'kravhantering_session=opaque-session\n',
    ),
    statSync: vi.fn(() => ({
      isFile: () => true,
      mode: 0o100600,
      size: 1024,
    })),
    ...overrides,
  }
}

function jsonResponse(body, { headers = {}, status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  })
}

const identityHeaders = Object.freeze({
  'x-kravhantering-ai-guard-active': 'true',
  'x-kravhantering-deployment-environment': 'staging',
  'x-kravhantering-deployment-environment-id': 'staging-eu-test',
})

function successfulFetch(profileIds = [PATH.aiRunProfileId]) {
  return vi.fn(async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/admin/ai-run-profiles') {
      return jsonResponse(
        profileIds.map(id => ({
          blockers: [],
          configurationStatus: 'configured',
          configurationVersion: 1,
          id,
          modelRevisionId: PATH.aiConnectionModelRevisionId,
          operationalStatus: 'enabled',
          profileKey: 'generation_without_images',
        })),
        { headers: identityHeaders },
      )
    }
    if (url.pathname === `/api/admin/ai-connections/${PATH.aiConnectionId}`) {
      return jsonResponse({
        adapterKey: PATH.adapterType,
        lifecycleStatus: 'active',
        models: [
          {
            revisions: [
              {
                id: PATH.aiConnectionModelRevisionId,
                revisionToken: 'model-revision-token',
                status: 'verified',
              },
            ],
          },
        ],
      })
    }
    if (
      url.pathname ===
      `/api/admin/ai-connections/${PATH.aiConnectionId}/actions`
    ) {
      const body = JSON.parse(String(init.body))
      if (body.action === 'verify_live_path') {
        const index = profileIds.indexOf(PATH.aiRunProfileId)
        return jsonResponse({
          ...LIVE_PROOF,
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: PATH.aiRunProfileId,
          executionId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          profileToken: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        })
      }
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
}

function successfulDistinctPathsFetch(paths = CONFIGURED_PATHS) {
  return vi.fn(async (input, _init = {}) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/admin/ai-run-profiles') {
      return jsonResponse(
        paths.map(path => ({
          blockers: [],
          configurationStatus: 'configured',
          configurationVersion: path.aiRunProfileConfigurationVersion,
          id: path.aiRunProfileId,
          modelRevisionId: path.aiConnectionModelRevisionId,
          operationalStatus: 'enabled',
          profileKey: path.profileKey,
        })),
        { headers: identityHeaders },
      )
    }
    const path = paths.find(candidate =>
      url.pathname.startsWith(
        `/api/admin/ai-connections/${candidate.aiConnectionId}`,
      ),
    )
    if (!path) throw new Error(`Unexpected URL: ${url}`)
    if (url.pathname.endsWith('/actions')) {
      const index = paths.indexOf(path) + 1
      return jsonResponse({
        ...LIVE_PROOF,
        adapterType: path.adapterType,
        aiConnectionId: path.aiConnectionId,
        aiConnectionModelRevisionId: path.aiConnectionModelRevisionId,
        aiRunProfileConfigurationVersion: 1,
        aiRunProfileId: path.aiRunProfileId,
        connectionRevisionToken: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        executionId: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        modelRevisionToken: `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        profileToken: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })
    }
    return jsonResponse({
      adapterKey: path.adapterType,
      lifecycleStatus: 'active',
      models: [
        {
          revisions: [
            {
              id: path.aiConnectionModelRevisionId,
              revisionToken: 'preflight-token',
              status: 'verified',
            },
          ],
        },
      ],
    })
  })
}

describe('staging-live synthetic AI probe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does nothing unless the operator explicitly opts in', () => {
    expect(
      stagingLiveProbeConfiguration({}, { readFileSync: vi.fn() }),
    ).toEqual({ status: 'skipped' })
  })

  it('uses only the guarded-compatible fixed Admin verification actions', async () => {
    const fetchImpl = successfulFetch()

    const result = await runAiStagingLiveSyntheticProbe(configuration(), {
      fetchImpl,
    })

    expect(result).toEqual({
      inventory: {
        intendedPaths: [VERIFIED_PATH],
        verifiedPaths: [VERIFIED_PATH],
      },
      liveExecutionProof: [LIVE_PROOF],
      syntheticProbe: {
        ...VERIFIED_PATH,
        externalLiveCallMade: true,
        outcome: 'completed',
        payloadClassification: 'synthetic',
      },
    })
    const requests = fetchImpl.mock.calls.map(([input, init]) => ({
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      path: new URL(String(input)).pathname,
    }))
    expect(requests).toEqual([
      { body: undefined, path: '/api/admin/ai-run-profiles' },
      {
        body: undefined,
        path: `/api/admin/ai-connections/${PATH.aiConnectionId}`,
      },
      {
        body: {
          action: 'verify_live_path',
          expectedEnvironmentId: 'staging-eu-test',
          modelRevisionId: PATH.aiConnectionModelRevisionId,
          profileKey: 'generation_without_images',
        },
        path: `/api/admin/ai-connections/${PATH.aiConnectionId}/actions`,
      },
    ])
    expect(JSON.stringify(requests)).not.toContain('areaId')
    expect(JSON.stringify(requests)).not.toContain('need')
    expect(JSON.stringify(requests)).not.toContain(
      'generate-requirement-import',
    )
  })

  it('emits a fragment that composes directly into strict gate v3 evidence', async () => {
    const fragment = await runAiStagingLiveSyntheticProbe(
      configuration({ intendedPaths: CONFIGURED_PATHS }),
      { fetchImpl: successfulDistinctPathsFetch() },
    )

    expect(
      assessAiDeploymentGate({
        alerts: {
          activeProfileBlocked: true,
          authenticationFailure: true,
          circuitBreakerOpened: true,
        },
        checks: REQUIRED_CHECK_AXES.map(axis => ({
          axis,
          evidenceId: `evidence-${axis}`,
          outcome: 'passed',
          suiteVersion: 'v3',
        })),
        egress: { deploymentPolicyEnforced: true },
        environment: 'staging',
        guardActive: true,
        keyring: {
          activeWriteVersionExplicit: true,
          requiredVersionsPresentOnEveryNode: true,
        },
        restore: {
          databaseAndKeyringRestoredTogether: true,
          providerSecretsAuthenticated: true,
        },
        schemaVersion: 3,
        secureDefaults: {
          contentGatesVerified: true,
          privacyFloorVerified: true,
        },
        verificationMode: 'staging_live',
        ...fragment,
      }),
    ).toMatchObject({ blockers: [], readyToRelease: true })

    const omitted = structuredClone(fragment)
    omitted.liveExecutionProof.pop()
    expect(
      assessAiDeploymentGate({
        alerts: {
          activeProfileBlocked: true,
          authenticationFailure: true,
          circuitBreakerOpened: true,
        },
        checks: REQUIRED_CHECK_AXES.map(axis => ({
          axis,
          evidenceId: `evidence-${axis}`,
          outcome: 'passed',
          suiteVersion: 'v3',
        })),
        egress: { deploymentPolicyEnforced: true },
        environment: 'staging',
        guardActive: true,
        keyring: {
          activeWriteVersionExplicit: true,
          requiredVersionsPresentOnEveryNode: true,
        },
        restore: {
          databaseAndKeyringRestoredTogether: true,
          providerSecretsAuthenticated: true,
        },
        schemaVersion: 3,
        secureDefaults: {
          contentGatesVerified: true,
          privacyFloorVerified: true,
        },
        verificationMode: 'staging_live',
        ...omitted,
      }).blockers,
    ).toContain('staging_live_execution_path_mismatch')

    const swapped = structuredClone(fragment)
    swapped.liveExecutionProof[0].modelRevisionToken =
      swapped.liveExecutionProof[1].modelRevisionToken
    expect(
      assessAiDeploymentGate({
        alerts: {
          activeProfileBlocked: true,
          authenticationFailure: true,
          circuitBreakerOpened: true,
        },
        checks: REQUIRED_CHECK_AXES.map(axis => ({
          axis,
          evidenceId: `evidence-${axis}`,
          outcome: 'passed',
          suiteVersion: 'v3',
        })),
        egress: { deploymentPolicyEnforced: true },
        environment: 'staging',
        guardActive: true,
        keyring: {
          activeWriteVersionExplicit: true,
          requiredVersionsPresentOnEveryNode: true,
        },
        restore: {
          databaseAndKeyringRestoredTogether: true,
          providerSecretsAuthenticated: true,
        },
        schemaVersion: 3,
        secureDefaults: {
          contentGatesVerified: true,
          privacyFloorVerified: true,
        },
        verificationMode: 'staging_live',
        ...swapped,
      }).blockers,
    ).toContain('staging_live_execution_path_mismatch')
  })

  it('loads one bounded private path for each fixed profile', () => {
    expect(
      stagingLiveProbeConfiguration(configuredEnv(), privateCookieFile()),
    ).toEqual({
      baseUrl: 'https://staging.example.test/',
      cookie: 'kravhantering_session=opaque-session',
      expectedEnvironmentId: 'staging-eu-test',
      intendedPaths: CONFIGURED_PATHS,
      status: 'configured',
    })
  })

  it.each([
    [
      'missing setting',
      configuredEnv({ AI_STAGING_LIVE_PATHS_FILE: ' ' }),
      privateCookieFile(),
      'AI_STAGING_LIVE_PATHS_FILE is required',
    ],
    [
      'non-HTTPS URL',
      configuredEnv({
        AI_STAGING_LIVE_BASE_URL: 'http://staging.example.test',
      }),
      privateCookieFile(),
      'must use HTTPS without userinfo',
    ],
    [
      'public cookie file',
      configuredEnv(),
      privateCookieFile({
        statSync: vi.fn(() => ({ isFile: () => true, mode: 0o100644 })),
      }),
      'must be a private regular file',
    ],
    [
      'unsafe environment id',
      configuredEnv({ AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID: 'stage one' }),
      privateCookieFile(),
      'AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID is invalid',
    ],
    [
      'controlled adapter',
      configuredEnv(),
      privateCookieFile({
        readFileSync: vi.fn(path =>
          path === '/private/staging-paths.json'
            ? JSON.stringify([
                { ...CONFIGURED_PATHS[0], adapterType: 'controlled_test' },
                CONFIGURED_PATHS[1],
                CONFIGURED_PATHS[2],
              ])
            : 'kravhantering_session=opaque-session',
        ),
      }),
      'must use an external adapter',
    ],
    [
      'duplicate fixed profile',
      configuredEnv(),
      privateCookieFile({
        readFileSync: vi.fn(path =>
          path === '/private/staging-paths.json'
            ? JSON.stringify([
                CONFIGURED_PATHS[0],
                {
                  ...CONFIGURED_PATHS[1],
                  profileKey: CONFIGURED_PATHS[0].profileKey,
                },
                CONFIGURED_PATHS[2],
              ])
            : 'kravhantering_session=opaque-session',
        ),
      }),
      'bind each fixed profile exactly once',
    ],
    [
      'malformed paths JSON',
      configuredEnv(),
      privateCookieFile({
        readFileSync: vi.fn(path =>
          path === '/private/staging-paths.json'
            ? '{not-json'
            : 'kravhantering_session=opaque-session',
        ),
      }),
      'must contain valid JSON',
    ],
    [
      'unreadable paths file',
      configuredEnv(),
      privateCookieFile({
        statSync: vi.fn(() => {
          throw new Error('EACCES')
        }),
      }),
      'EACCES',
    ],
    [
      'missing fixed path',
      configuredEnv(),
      privateCookieFile({
        readFileSync: vi.fn(path =>
          path === '/private/staging-paths.json'
            ? JSON.stringify(CONFIGURED_PATHS.slice(0, 2))
            : 'kravhantering_session=opaque-session',
        ),
      }),
      'must contain exactly 3 paths',
    ],
    [
      'unknown fixed profile',
      configuredEnv(),
      privateCookieFile({
        readFileSync: vi.fn(path =>
          path === '/private/staging-paths.json'
            ? JSON.stringify([
                { ...CONFIGURED_PATHS[0], profileKey: 'unknown_profile' },
                CONFIGURED_PATHS[1],
                CONFIGURED_PATHS[2],
              ])
            : 'kravhantering_session=opaque-session',
        ),
      }),
      'path 1 is invalid',
    ],
  ])('rejects %s', (_name, env, fsImpl, message) => {
    expect(() => stagingLiveProbeConfiguration(env, fsImpl)).toThrow(message)
  })

  it.each([
    ['production', identityHeaders],
    [
      'an unexpected staging identity',
      {
        ...identityHeaders,
        'x-kravhantering-deployment-environment-id': 'other-staging',
      },
    ],
    [
      'an inactive global guard',
      { ...identityHeaders, 'x-kravhantering-ai-guard-active': 'false' },
    ],
  ])('fails closed before live actions for %s', async (condition, headers) => {
    const actualHeaders =
      condition === 'production'
        ? {
            ...headers,
            'x-kravhantering-deployment-environment': 'production',
          }
        : headers
    const fetchImpl = vi.fn(async () =>
      jsonResponse([], { headers: actualHeaders }),
    )

    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl }),
    ).rejects.toThrow(/server-proven staging environment|global AI guard/u)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('preflights every configured stable profile before live actions', async () => {
    const fetchImpl = successfulDistinctPathsFetch()
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse(
        [
          {
            blockers: [],
            configurationStatus: 'configured',
            configurationVersion: 1,
            id: PATH.aiRunProfileId,
            modelRevisionId: PATH.aiConnectionModelRevisionId,
            operationalStatus: 'enabled',
            profileKey: 'generation_without_images',
          },
        ],
        { headers: identityHeaders },
      ),
    )

    await expect(
      runAiStagingLiveSyntheticProbe(
        configuration({
          intendedPaths: CONFIGURED_PATHS.slice(0, 2),
        }),
        { fetchImpl },
      ),
    ).rejects.toThrow(
      'Every intended profile must be configured, enabled, and unblocked',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('requires the exact path and the fixed passing Admin suite', async () => {
    await expect(
      runAiStagingLiveSyntheticProbe(
        configuration({
          intendedPaths: [
            { ...CONFIGURED_PATHS[0], adapterType: 'unexpected-adapter' },
          ],
        }),
        { fetchImpl: successfulFetch() },
      ),
    ).rejects.toThrow('adapter does not match the intended staging path')

    const wrongSuite = successfulFetch()
    wrongSuite.mockImplementationOnce(async input => successfulFetch()(input))
    wrongSuite.mockImplementationOnce(async input => successfulFetch()(input))
    wrongSuite.mockImplementationOnce(async () =>
      jsonResponse({ ...LIVE_PROOF, testSuiteVersion: 'old-suite-v2' }),
    )
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), {
        fetchImpl: wrongSuite,
      }),
    ).rejects.toThrow(
      `The fixed Admin functional probe ${ADMIN_PROBE_VERSION} did not pass.`,
    )
  })

  it.each([
    ['controlled result', { ...LIVE_PROOF, adapterType: 'controlled_test' }],
    [
      'unobserved external call',
      { ...LIVE_PROOF, externalLiveCallMade: false },
    ],
    ['swapped model', { ...LIVE_PROOF, aiConnectionModelRevisionId: 'other' }],
    [
      'missing proof field',
      Object.fromEntries(Object.entries(LIVE_PROOF).slice(1)),
    ],
    ['extra proof field', { ...LIVE_PROOF, detail: 'forbidden' }],
  ])('rejects %s from the current live operation', async (_name, proof) => {
    const fetchImpl = successfulFetch()
    fetchImpl.mockImplementationOnce(async input => successfulFetch()(input))
    fetchImpl.mockImplementationOnce(async input => successfulFetch()(input))
    fetchImpl.mockImplementationOnce(async () => jsonResponse(proof))

    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl }),
    ).rejects.toThrow(
      `The fixed Admin functional probe ${ADMIN_PROBE_VERSION} did not pass.`,
    )
  })

  it('bounds every request deadline and response size', async () => {
    const fetchImpl = successfulFetch()
    await runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl })
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }

    const oversized = vi.fn(
      async () =>
        new Response('x'.repeat(1_048_577), {
          headers: {
            'content-type': 'application/json',
            ...identityHeaders,
          },
          status: 200,
        }),
    )
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), {
        fetchImpl: oversized,
      }),
    ).rejects.toThrow('bounded response size')
  })

  it('runs the default-skip CLI without network and configured CLI with injected fetch', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const fetchImpl = successfulDistinctPathsFetch()
    vi.stubGlobal('fetch', fetchImpl)

    await expect(main({ env: {}, fsImpl: privateCookieFile() })).resolves.toBe(
      0,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(
      main({ env: configuredEnv(), fsImpl: privateCookieFile() }),
    ).resolves.toBe(0)
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"syntheticProbe"'),
    )
  })
})
