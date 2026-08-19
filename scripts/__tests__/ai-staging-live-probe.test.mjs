import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  main,
  runAiStagingLiveSyntheticProbe,
  stagingLiveProbeConfiguration,
} from '../release/ai-staging-live-probe.mjs'

const PATH = Object.freeze({
  adapterType: 'openrouter',
  aiConnectionId: '10000000-0000-4000-8000-000000000001',
  aiConnectionModelRevisionId: '20000000-0000-4000-8000-000000000001',
  aiRunProfileRevisionId: '30000000-0000-4000-8000-000000000001',
})

function configuration(overrides = {}) {
  return {
    areaId: 1,
    baseUrl: 'https://staging.example.test',
    cookie: 'kravhantering_session=opaque-session',
    intendedPath: PATH,
    profileKey: 'generation_without_images',
    ...overrides,
  }
}

function configuredEnv(overrides = {}) {
  return {
    AI_STAGING_LIVE_ADAPTER_TYPE: PATH.adapterType,
    AI_STAGING_LIVE_AREA_ID: '1',
    AI_STAGING_LIVE_BASE_URL: 'https://staging.example.test/path?query=value',
    AI_STAGING_LIVE_CONNECTION_ID: PATH.aiConnectionId,
    AI_STAGING_LIVE_MODEL_REVISION_ID: PATH.aiConnectionModelRevisionId,
    AI_STAGING_LIVE_PROFILE_REVISION_ID: PATH.aiRunProfileRevisionId,
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

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function successfulFetch() {
  return vi.fn(async input => {
    const url = new URL(String(input))
    if (url.pathname === '/api/admin/ai-run-profiles') {
      return jsonResponse([
        {
          activeRevisionId: PATH.aiRunProfileRevisionId,
          blockers: [],
          operationalStatus: 'enabled',
          profileKey: 'generation_without_images',
        },
      ])
    }
    if (
      url.pathname ===
      '/api/admin/ai-run-profiles/generation_without_images/revisions'
    ) {
      return jsonResponse([
        {
          id: PATH.aiRunProfileRevisionId,
          modelRevisionId: PATH.aiConnectionModelRevisionId,
          status: 'active',
        },
      ])
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
                status: 'verified',
              },
            ],
          },
        ],
      })
    }
    if (url.pathname === '/api/ai/generate-requirement-import') {
      return new Response(
        'event: generating\ndata: {"chunk":""}\n\n' +
          'event: done\ndata: {"payload":{"schemaVersion":"requirement-import.v4","requirements":[]}}\n\n',
        { headers: { 'content-type': 'text/event-stream' }, status: 200 },
      )
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

  it('preflights the exact active path and runs only a fixed synthetic request', async () => {
    const fetchImpl = successfulFetch()

    const result = await runAiStagingLiveSyntheticProbe(configuration(), {
      fetchImpl,
    })

    expect(result).toEqual({
      intendedPath: PATH,
      syntheticProbe: {
        ...PATH,
        externalLiveCallMade: true,
        outcome: 'completed',
        payloadClassification: 'synthetic',
      },
    })
    const generationCall = fetchImpl.mock.calls.at(-1)
    expect(JSON.parse(generationCall?.[1]?.body)).toEqual({
      areaId: 1,
      count: 1,
      locale: 'en',
      mode: 'library',
      need: 'Synthetic staging verification. No personal or production data.',
    })
  })

  it('loads a private opt-in configuration and normalizes the base URL', () => {
    expect(
      stagingLiveProbeConfiguration(configuredEnv(), privateCookieFile()),
    ).toEqual({
      areaId: 1,
      baseUrl: 'https://staging.example.test/',
      cookie: 'kravhantering_session=opaque-session',
      intendedPath: PATH,
      profileKey: 'generation_without_images',
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
      'URL userinfo',
      configuredEnv({
        AI_STAGING_LIVE_BASE_URL: 'https://user@staging.example.test',
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
      'invalid cookie',
      configuredEnv(),
      privateCookieFile({ readFileSync: vi.fn(() => 'cookie\nheader') }),
      'session cookie file is invalid',
    ],
    [
      'area identifier',
      configuredEnv({ AI_STAGING_LIVE_AREA_ID: '0' }),
      privateCookieFile(),
      'must be a positive integer',
    ],
    [
      'unsafe opaque path',
      configuredEnv({ AI_STAGING_LIVE_ADAPTER_TYPE: 'open router' }),
      privateCookieFile(),
      'AI_STAGING_LIVE_ADAPTER_TYPE is invalid',
    ],
  ])('rejects %s', (_name, env, fsImpl, message) => {
    expect(() => stagingLiveProbeConfiguration(env, fsImpl)).toThrow(message)
  })

  it('stops before egress when the intended active path does not match', async () => {
    const fetchImpl = successfulFetch()

    await expect(
      runAiStagingLiveSyntheticProbe(
        configuration({
          intendedPath: { ...PATH, adapterType: 'unexpected-adapter' },
        }),
        { fetchImpl },
      ),
    ).rejects.toThrow('adapter does not match the intended staging path')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('requires HTTPS and exactly one successful terminal event', async () => {
    await expect(
      runAiStagingLiveSyntheticProbe(
        configuration({ baseUrl: 'http://staging.example.test' }),
        { fetchImpl: successfulFetch() },
      ),
    ).rejects.toThrow('must use HTTPS')

    const fetchImpl = successfulFetch()
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse([
        {
          activeRevisionId: PATH.aiRunProfileRevisionId,
          blockers: [],
          operationalStatus: 'enabled',
          profileKey: 'generation_without_images',
        },
      ]),
    )
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse([
        {
          id: PATH.aiRunProfileRevisionId,
          modelRevisionId: PATH.aiConnectionModelRevisionId,
          status: 'active',
        },
      ]),
    )
    fetchImpl.mockImplementationOnce(async () =>
      jsonResponse({
        adapterKey: PATH.adapterType,
        lifecycleStatus: 'active',
        models: [
          {
            revisions: [
              {
                id: PATH.aiConnectionModelRevisionId,
                status: 'verified',
              },
            ],
          },
        ],
      }),
    )
    fetchImpl.mockImplementationOnce(
      async () =>
        new Response(
          'event: done\ndata: {}\n\nevent: error\ndata: {"code":"failed"}\n\n',
          { headers: { 'content-type': 'text/event-stream' }, status: 200 },
        ),
    )

    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl }),
    ).rejects.toThrow('exactly one successful terminal event')
  })

  it('rejects failed and malformed preflight responses before generation', async () => {
    const failed = successfulFetch()
    failed.mockImplementationOnce(
      async () => new Response('{}', { status: 503 }),
    )
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl: failed }),
    ).rejects.toThrow('preflight failed with HTTP 503')

    const malformed = successfulFetch()
    malformed.mockImplementationOnce(async () => jsonResponse({}))
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl: malformed }),
    ).rejects.toThrow('Run-profile preflight returned invalid JSON')

    const revisionMismatch = successfulFetch()
    revisionMismatch.mockImplementationOnce(async () =>
      jsonResponse([
        {
          activeRevisionId: PATH.aiRunProfileRevisionId,
          blockers: [],
          operationalStatus: 'enabled',
          profileKey: 'generation_without_images',
        },
      ]),
    )
    revisionMismatch.mockImplementationOnce(async () => jsonResponse([]))
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), {
        fetchImpl: revisionMismatch,
      }),
    ).rejects.toThrow('model revision does not match')
  })

  it('rejects unverified model and failed generation responses', async () => {
    const unverified = successfulFetch()
    unverified.mockImplementationOnce(async () =>
      jsonResponse([
        {
          activeRevisionId: PATH.aiRunProfileRevisionId,
          blockers: [],
          operationalStatus: 'enabled',
          profileKey: 'generation_without_images',
        },
      ]),
    )
    unverified.mockImplementationOnce(async () =>
      jsonResponse([
        {
          id: PATH.aiRunProfileRevisionId,
          modelRevisionId: PATH.aiConnectionModelRevisionId,
          status: 'active',
        },
      ]),
    )
    unverified.mockImplementationOnce(async () =>
      jsonResponse({
        adapterKey: PATH.adapterType,
        lifecycleStatus: 'active',
        models: [{ revisions: [{ id: PATH.aiConnectionModelRevisionId }] }],
      }),
    )
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), {
        fetchImpl: unverified,
      }),
    ).rejects.toThrow('model revision is not verified')

    const failed = successfulFetch()
    failed.mockImplementationOnce(async () =>
      successfulFetch()(
        'https://staging.example.test/api/admin/ai-run-profiles',
      ),
    )
    failed.mockImplementationOnce(async () =>
      successfulFetch()(
        'https://staging.example.test/api/admin/ai-run-profiles/generation_without_images/revisions',
      ),
    )
    failed.mockImplementationOnce(async () =>
      successfulFetch()(
        `https://staging.example.test/api/admin/ai-connections/${PATH.aiConnectionId}`,
      ),
    )
    failed.mockImplementationOnce(
      async () => new Response('{}', { status: 502 }),
    )
    await expect(
      runAiStagingLiveSyntheticProbe(configuration(), { fetchImpl: failed }),
    ).rejects.toThrow('probe failed with HTTP 502')
  })

  it('runs the default-skip CLI without network and a configured CLI with the injected global fetch', async () => {
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
