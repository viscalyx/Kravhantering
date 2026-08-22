import { describe, expect, it, vi } from 'vitest'
import {
  type AiConnectionTrustConfiguration,
  AiConnectionTrustError,
  type AiDeploymentTrustPolicy,
  authorizeAiConnectionTarget,
  createAiEgressTransport,
  enforceAiDataPolicy,
} from '@/lib/ai/connection-trust'

function connection(
  overrides: Partial<AiConnectionTrustConfiguration> = {},
): AiConnectionTrustConfiguration {
  return {
    authenticationType: 'static_secret',
    dataPolicy: {
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      subprocessors: [],
    },
    egressPolicyKey: 'approved-public-ai',
    endpointUrl: 'https://ai.example.test/v1',
    tlsPolicyKey: 'public-web-pki',
    ...overrides,
  }
}

function deployment(
  overrides: Partial<AiDeploymentTrustPolicy> = {},
): AiDeploymentTrustPolicy {
  return {
    dataPolicies: {
      generate_without_images: {
        allowedProcessingRegions: ['SE'],
        informationClassOrder: ['public', 'internal', 'restricted'],
        maximumInformationClass: 'internal',
        maximumRetentionDays: 0,
        personalDataAllowed: false,
        requireTrainingProhibited: true,
      },
    },
    egressPolicies: {
      'approved-public-ai': {
        allowedOrigins: ['https://ai.example.test'],
        privateSidecarOrigins: [],
      },
    },
    environment: 'production',
    resolveHostname: vi.fn(async () => ['93.184.216.34']),
    tlsPolicies: {
      'public-web-pki': {
        certificateValidation: 'required',
        fetchPinned: vi.fn(),
        trustSource: 'public_web_pki',
      },
    },
    ...overrides,
  }
}

describe('AI connection trust boundary', () => {
  it.each([
    'not a URL',
    'http://ai.example.test/v1',
    'https://user:secret@ai.example.test/v1',
    'https://ai.example.test/v1?token=secret',
    'https://ai.example.test/v1#fragment',
    'https://unapproved.example.test/v1',
  ])('rejects an unsafe production endpoint before egress: %s', async url => {
    await expect(
      authorizeAiConnectionTarget(
        connection({ endpointUrl: url }),
        deployment(),
      ),
    ).rejects.toMatchObject({ code: 'endpoint_not_allowed' })
  })

  it('rejects DNS answers outside public ranges for ordinary destinations', async () => {
    const policy = deployment({
      resolveHostname: vi.fn(async () => ['10.0.0.8']),
    })

    await expect(
      authorizeAiConnectionTarget(connection(), policy),
    ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
  })

  it.each([
    '0.0.0.1',
    '100.64.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    'not-an-ip',
    'fc00::1',
    '2001::1',
    '2001:db8::1',
    '2001:10::1',
    '2001:20::1',
    '2002::1',
    '3fff::1',
  ])('rejects a non-public DNS answer: %s', async address => {
    await expect(
      authorizeAiConnectionTarget(
        connection(),
        deployment({ resolveHostname: vi.fn(async () => [address]) }),
      ),
    ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
  })

  it('accepts public IPv6 and ignores malformed deployment allowlist entries', async () => {
    const policy = deployment({
      egressPolicies: {
        public: {
          allowedOrigins: [
            'not a URL',
            'https://bad.example.test/path',
            'https://ai.example.test',
          ],
          privateSidecarOrigins: [],
        },
      },
      resolveHostname: vi.fn(async () => ['2606:2800:220:1::1']),
    })

    await expect(
      authorizeAiConnectionTarget(
        connection({ egressPolicyKey: 'public' }),
        policy,
      ),
    ).resolves.toMatchObject({ isPrivateSidecar: false })

    await expect(
      authorizeAiConnectionTarget(connection({ egressPolicyKey: 'public' }), {
        ...policy,
        resolveHostname: vi.fn(async () => ['::ffff:93.184.216.34']),
      }),
    ).resolves.toMatchObject({ isPrivateSidecar: false })
  })

  it('fails closed for empty or unavailable DNS answers', async () => {
    await expect(
      authorizeAiConnectionTarget(
        connection(),
        deployment({ resolveHostname: vi.fn(async () => []) }),
      ),
    ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
    await expect(
      authorizeAiConnectionTarget(
        connection(),
        deployment({
          resolveHostname: vi.fn(async () => {
            throw new Error('resolver internals')
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
  })

  it.each(['::ffff:127.0.0.1', '::ffff:7f00:1'])(
    'rejects an IPv4-mapped IPv6 private address: %s',
    async address => {
      const policy = deployment({
        resolveHostname: vi.fn(async () => [address]),
      })

      await expect(
        authorizeAiConnectionTarget(connection(), policy),
      ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
    },
  )

  it('allows a private sidecar only when deployment fixes its exact origin and address', async () => {
    const policy = deployment({
      egressPolicies: {
        sidecar: {
          allowedOrigins: [],
          privateSidecarOrigins: ['https://ai-sidecar.internal:8443'],
          privateSidecarAddresses: ['10.42.0.7'],
        },
      },
      resolveHostname: vi.fn(async () => ['10.42.0.7']),
    })

    await expect(
      authorizeAiConnectionTarget(
        connection({
          egressPolicyKey: 'sidecar',
          endpointUrl: 'https://ai-sidecar.internal:8443',
        }),
        policy,
      ),
    ).resolves.toMatchObject({ hostname: 'ai-sidecar.internal' })
  })

  it.each([[['93.184.216.34']], [['10.42.0.7', '93.184.216.34']]])(
    'rejects every unlisted sidecar answer, including public and mixed answers',
    async addresses => {
      const policy = deployment({
        egressPolicies: {
          sidecar: {
            allowedOrigins: [],
            privateSidecarAddresses: ['10.42.0.7'],
            privateSidecarOrigins: ['https://ai-sidecar.internal:8443'],
          },
        },
        resolveHostname: vi.fn(async () => addresses),
      })

      await expect(
        authorizeAiConnectionTarget(
          connection({
            egressPolicyKey: 'sidecar',
            endpointUrl: 'https://ai-sidecar.internal:8443',
          }),
          policy,
        ),
      ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
    },
  )

  it('re-resolves before every transport connection and blocks DNS rebinding', async () => {
    const fetchPinned = vi.fn(async () => new Response('{}'))
    const resolveHostname = vi
      .fn()
      .mockResolvedValueOnce(['93.184.216.34'])
      .mockResolvedValueOnce(['127.0.0.1'])
    const policy = deployment({
      resolveHostname,
      tlsPolicies: {
        'public-web-pki': {
          certificateValidation: 'required',
          fetchPinned,
          trustSource: 'public_web_pki',
        },
      },
    })
    const target = await authorizeAiConnectionTarget(connection(), policy)
    const transport = createAiEgressTransport(target, policy)

    await expect(
      transport.fetch('https://ai.example.test/v1/chat/completions', {
        method: 'POST',
        redirect: 'error',
      }),
    ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
    expect(fetchPinned).not.toHaveBeenCalled()
  })

  it('forbids redirect-capable requests and cross-origin transport use', async () => {
    const policy = deployment()
    const target = await authorizeAiConnectionTarget(connection(), policy)
    const transport = createAiEgressTransport(target, policy)

    await expect(
      transport.fetch('https://ai.example.test/v1', { redirect: 'follow' }),
    ).rejects.toBeInstanceOf(AiConnectionTrustError)
    await expect(
      transport.fetch('https://other.example.test/v1', { redirect: 'error' }),
    ).rejects.toMatchObject({ code: 'endpoint_not_allowed' })
  })

  it('uses only the approved TLS transport and fails closed if transport policy changes', async () => {
    const fetchPinned = vi.fn(async () => new Response('{}', { status: 200 }))
    const policy = deployment({
      tlsPolicies: {
        'public-web-pki': {
          certificateValidation: 'required',
          fetchPinned,
          trustSource: 'public_web_pki',
        },
      },
    })
    const target = await authorizeAiConnectionTarget(
      connection({ endpointUrl: 'https://ai.example.test/v1/' }),
      policy,
    )
    const transport = createAiEgressTransport(target, policy)

    await expect(
      transport.fetch('https://ai.example.test/v1/chat/completions', {
        redirect: 'error',
      }),
    ).resolves.toMatchObject({ status: 200 })
    expect(fetchPinned).toHaveBeenCalledWith({
      init: { redirect: 'error' },
      resolvedAddresses: ['93.184.216.34'],
      serverName: 'ai.example.test',
      url: 'https://ai.example.test/v1/chat/completions',
    })
    await expect(
      transport.fetch('not a URL', { redirect: 'error' }),
    ).rejects.toMatchObject({ code: 'endpoint_not_allowed' })

    expect(() =>
      createAiEgressTransport(target, {
        ...policy,
        egressPolicies: {},
      }),
    ).toThrowError(AiConnectionTrustError)
    expect(() =>
      createAiEgressTransport(target, {
        ...policy,
        tlsPolicies: {},
      }),
    ).toThrowError(AiConnectionTrustError)
  })

  it('fails closed when the DNS resolver fails during transport use', async () => {
    const policy = deployment()
    const target = await authorizeAiConnectionTarget(connection(), policy)
    const transport = createAiEgressTransport(target, {
      ...policy,
      resolveHostname: vi.fn(async () => {
        throw new Error('resolver internals')
      }),
    })

    await expect(
      transport.fetch('https://ai.example.test/v1', { redirect: 'error' }),
    ).rejects.toMatchObject({ code: 'resolved_address_not_allowed' })
  })

  it('supports only fixed authentication forms and confines no-auth HTTP to deployment-owned development local', async () => {
    await expect(
      authorizeAiConnectionTarget(
        connection({
          authenticationType: 'free_header' as 'static_secret',
        }),
        deployment(),
      ),
    ).rejects.toMatchObject({ code: 'authentication_not_allowed' })

    await expect(
      authorizeAiConnectionTarget(
        connection({ authenticationType: 'none' }),
        deployment(),
      ),
    ).rejects.toMatchObject({ code: 'authentication_not_allowed' })

    const local = deployment({
      developmentLocalOrigin: 'http://controlled-sidecar:8080',
      egressPolicies: {
        local: {
          allowedOrigins: [],
          privateSidecarAddresses: ['172.20.0.9'],
          privateSidecarOrigins: ['http://controlled-sidecar:8080'],
        },
      },
      environment: 'development',
      resolveHostname: vi.fn(async () => ['172.20.0.9']),
    })

    await expect(
      authorizeAiConnectionTarget(
        connection({
          authenticationType: 'none',
          egressPolicyKey: 'local',
          endpointUrl: 'http://controlled-sidecar:8080',
        }),
        local,
      ),
    ).resolves.toMatchObject({ protocol: 'http:' })
  })

  it('requires a deployment-owned TLS policy with certificate validation', async () => {
    const disabledValidation = deployment({
      tlsPolicies: {
        insecure: {
          certificateValidation: 'disabled' as 'required',
          fetchPinned: vi.fn(),
          trustSource: 'public_web_pki',
        },
      },
    })

    await expect(
      authorizeAiConnectionTarget(
        connection({ tlsPolicyKey: 'insecure' }),
        disabledValidation,
      ),
    ).rejects.toMatchObject({ code: 'tls_policy_missing' })
  })

  it('requires named egress and TLS policies', async () => {
    await expect(
      authorizeAiConnectionTarget(
        connection({ egressPolicyKey: 'missing' }),
        deployment(),
      ),
    ).rejects.toMatchObject({ code: 'egress_policy_missing' })
    await expect(
      authorizeAiConnectionTarget(
        connection({ tlsPolicyKey: 'missing' }),
        deployment(),
      ),
    ).rejects.toMatchObject({ code: 'tls_policy_missing' })
  })

  it('fails closed when connection policy is incomplete or exceeds the fixed run policy', () => {
    const completeDataPolicy = connection().dataPolicy
    if (!completeDataPolicy)
      throw new Error('Fixture must include a data policy')
    expect(() =>
      enforceAiDataPolicy(
        connection({ dataPolicy: null }),
        'generate_without_images',
        deployment(),
      ),
    ).toThrowError(AiConnectionTrustError)
    expect(() =>
      enforceAiDataPolicy(
        connection({
          dataPolicy: {
            ...completeDataPolicy,
            isTrainingAllowed: true,
          },
        }),
        'generate_without_images',
        deployment(),
      ),
    ).toThrowError(AiConnectionTrustError)
  })

  it.each([
    {
      connectionPolicy: { isTrainingAllowed: true },
      runPolicy: { requireTrainingProhibited: false },
    },
    {
      connectionPolicy: { maximumRetentionDays: 1 },
      runPolicy: { maximumRetentionDays: 30 },
    },
  ])(
    'does not let a weaker deployment policy relax the AI request privacy minimum',
    ({ connectionPolicy, runPolicy }) => {
      const dataPolicy = connection().dataPolicy
      const required = deployment().dataPolicies.generate_without_images
      if (!dataPolicy || !required) throw new Error('Fixture policy missing')

      expect(() =>
        enforceAiDataPolicy(
          connection({ dataPolicy: { ...dataPolicy, ...connectionPolicy } }),
          'generate_without_images',
          deployment({
            dataPolicies: {
              generate_without_images: { ...required, ...runPolicy },
            },
          }),
        ),
      ).toThrowError(AiConnectionTrustError)
    },
  )

  it.each([
    [{ maximumInformationClass: 'public' }, {}],
    [{ isPersonalDataProcessed: false }, { personalDataAllowed: true }],
    [{ isPersonalDataProcessed: true }, { personalDataAllowed: false }],
    [{ maximumRetentionDays: 1 }, {}],
    [{ processingRegions: ['US'] }, {}],
  ])(
    'rejects a connection policy outside the deployment run policy',
    (connectionPolicy, requirement) => {
      const dataPolicy = connection().dataPolicy
      const runPolicy = deployment().dataPolicies.generate_without_images
      if (!dataPolicy || !runPolicy) throw new Error('Fixture policy missing')
      expect(() =>
        enforceAiDataPolicy(
          connection({ dataPolicy: { ...dataPolicy, ...connectionPolicy } }),
          'generate_without_images',
          deployment({
            dataPolicies: {
              generate_without_images: { ...runPolicy, ...requirement },
            },
          }),
        ),
      ).toThrowError(AiConnectionTrustError)
    },
  )
})
