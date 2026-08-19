import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  main,
  runAiStagingLiveSyntheticProbe,
  stagingLiveProbeConfiguration,
} from '../release/ai-staging-live-probe.mjs'

const ADMIN_PROBE_VERSION = 'ai-admin-functional-probe-v3'
const PATH = Object.freeze({
  adapterType: 'openrouter',
  aiConnectionId: '10000000-0000-4000-8000-000000000001',
  aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
  aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000001',
})
const SECOND_PROFILE_REVISION_ID = '30000000-0000-4000-8000-000000000002'
const LIVE_PROOF = Object.freeze({
  adapterType: PATH.adapterType,
  adapterVersion: '1',
  aiConnectionId: PATH.aiConnectionId,
  aiConnectionModelRevisionId: PATH.aiConnectionModelRevisionId,
  aiRunProfileRevisionId: PATH.aiRunProfileRevisionId,
  connectionRevisionToken: '40000000-0000-4000-8000-000000000001',
  executionId: '50000000-0000-4000-8000-000000000001',
  externalLiveCallMade: true,
  failureCategory: null,
  modelRevisionToken: '60000000-0000-4000-8000-000000000001',
  outcome: 'passed',
  profileRevisionToken: '70000000-0000-4000-8000-000000000001',
  testSuiteVersion: ADMIN_PROBE_VERSION,
})

function configuration(overrides = {}) {
  return {
    baseUrl: 'https://staging.example.test',
    cookie: 'kravhantering_session=opaque-session',
    expectedEnvironmentId: 'staging-eu-test',
    intendedPath: PATH,
    intendedProfileRevisionIds: [PATH.aiRunProfileRevisionId],
    ...overrides,
  }
}

function configuredEnv(overrides = {}) {
  return {
    AI_STAGING_LIVE_ADAPTER_TYPE: PATH.adapterType,
    AI_STAGING_LIVE_BASE_URL: 'https://staging.example.test/path?query=value',
    AI_STAGING_LIVE_CONNECTION_ID: PATH.aiConnectionId,
    AI_STAGING_LIVE_EXPECTED_ENVIRONMENT_ID: 'staging-eu-test',
    AI_STAGING_LIVE_MODEL_REVISION_ID: PATH.aiConnectionModelRevisionId,
    AI_STAGING_LIVE_PROFILE_REVISION_ID: PATH.aiRunProfileRevisionId,
    AI_STAGING_LIVE_PROFILE_REVISION_IDS: PATH.aiRunProfileRevisionId,
    AI_STAGING_LIVE_SESSION_COOKIE_FILE: '/private/session-cookie',
    AI_STAGING_LIVE_SYNTHETIC_PROBE: '1',
    ...overrides,
  }
}

function privateCookieFile(overrides = {}) {
  return {
    readFileSync: vi.fn(() => 'kravhantering_session=opaque-session\n'),
    statSync: vi.fn(() => ({ isFile: () => true, mode: 0o100600 })),
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

function successfulFetch(profileRevisionIds = [PATH.aiRunProfileRevisionId]) {
  return vi.fn(async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/admin/ai-run-profiles') {
      return jsonResponse(
        profileRevisionIds.map(activeRevisionId => ({
          activeRevisionId,
          blockers: [],
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
        const index = profileRevisionIds.indexOf(body.profileRevisionId)
        return jsonResponse({
          ...LIVE_PROOF,
          aiRunProfileRevisionId: body.profileRevisionId,
          executionId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          profileRevisionToken: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        })
      }
    }
    throw new Error(`Unexpected URL: ${url}`)
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

  it('uses only the guarded-compatible fixed Admin v3 verification actions', async () => {
    const fetchImpl = successfulFetch()

    const result = await runAiStagingLiveSyntheticProbe(configuration(), {
      fetchImpl,
    })

    expect(result).toEqual({
      adminFunctionalProbeVersion: ADMIN_PROBE_VERSION,
      intendedPath: PATH,
      liveExecutionProof: [LIVE_PROOF],
      preflightedProfileRevisionIds: [PATH.aiRunProfileRevisionId],
      syntheticProbe: {
        ...PATH,
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
          profileRevisionId: PATH.aiRunProfileRevisionId,
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

  it('binds a current execution proof to every intended profile tuple', async () => {
    const profileRevisionIds = [
      PATH.aiRunProfileRevisionId,
      SECOND_PROFILE_REVISION_ID,
    ]
    const fetchImpl = successfulFetch(profileRevisionIds)

    const result = await runAiStagingLiveSyntheticProbe(
      configuration({ intendedProfileRevisionIds: profileRevisionIds }),
      { fetchImpl },
    )

    expect(result.liveExecutionProof).toHaveLength(2)
    expect(
      result.liveExecutionProof.map(proof => proof.aiRunProfileRevisionId),
    ).toEqual(profileRevisionIds)
    expect(
      fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(2)
  })

  it('loads a private opt-in configuration with every intended profile revision', () => {
    expect(
      stagingLiveProbeConfiguration(
        configuredEnv({
          AI_STAGING_LIVE_PROFILE_REVISION_IDS: `${PATH.aiRunProfileRevisionId},${SECOND_PROFILE_REVISION_ID}`,
        }),
        privateCookieFile(),
      ),
    ).toEqual({
      baseUrl: 'https://staging.example.test/',
      cookie: 'kravhantering_session=opaque-session',
      expectedEnvironmentId: 'staging-eu-test',
      intendedPath: PATH,
      intendedProfileRevisionIds: [
        PATH.aiRunProfileRevisionId,
        SECOND_PROFILE_REVISION_ID,
      ],
      status: 'configured',
    })
  })

  it.each([
    [
      'missing setting',
      configuredEnv({ AI_STAGING_LIVE_CONNECTION_ID: ' ' }),
      privateCookieFile(),
      'AI_STAGING_LIVE_CONNECTION_ID is required',
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
      configuredEnv({ AI_STAGING_LIVE_ADAPTER_TYPE: 'controlled_test' }),
      privateCookieFile(),
      'must identify an external live adapter',
    ],
    [
      'duplicate profile revision',
      configuredEnv({
        AI_STAGING_LIVE_PROFILE_REVISION_IDS: `${PATH.aiRunProfileRevisionId},${PATH.aiRunProfileRevisionId}`,
      }),
      privateCookieFile(),
      'must contain unique values',
    ],
    [
      'too many profile revisions',
      configuredEnv({
        AI_STAGING_LIVE_PROFILE_REVISION_IDS: [
          PATH.aiRunProfileRevisionId,
          ...Array.from({ length: 100 }, (_, index) => `profile-${index}`),
        ].join(','),
      }),
      privateCookieFile(),
      'supports at most 100 values',
    ],
    [
      'representative profile omitted',
      configuredEnv({
        AI_STAGING_LIVE_PROFILE_REVISION_IDS: SECOND_PROFILE_REVISION_ID,
      }),
      privateCookieFile(),
      'must include AI_STAGING_LIVE_PROFILE_REVISION_ID',
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

  it('preflights every configured profile revision before live actions', async () => {
    const fetchImpl = successfulFetch()
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse(
        [
          {
            activeRevisionId: PATH.aiRunProfileRevisionId,
            blockers: [],
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
          intendedProfileRevisionIds: [
            PATH.aiRunProfileRevisionId,
            SECOND_PROFILE_REVISION_ID,
          ],
        }),
        { fetchImpl },
      ),
    ).rejects.toThrow('Every intended profile revision must be active')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('requires the exact path and the fixed passing Admin suite', async () => {
    await expect(
      runAiStagingLiveSyntheticProbe(
        configuration({
          intendedPath: { ...PATH, adapterType: 'unexpected-adapter' },
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
    ).rejects.toThrow('fixed Admin functional probe v3')
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
    ).rejects.toThrow('fixed Admin functional probe v3')
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
    const fetchImpl = successfulFetch()
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
