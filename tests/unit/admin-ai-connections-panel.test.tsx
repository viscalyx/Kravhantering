import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ModelForm,
  ProfileForm,
} from '@/app/[locale]/admin/panels/settings/ai-connections/model-profile-forms'
import type {
  AiAdminConnectionDetail,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      `${namespace}.${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`,
}))

const fetchMock = vi.fn()
const attemptId = '00000000-0000-4000-8000-000000000001'

const verifiedCapabilities = Object.fromEntries(
  [
    'aiAnalysis',
    'cost',
    'imageInput',
    'jsonSchemaSteering',
    'streaming',
    'tokenUsage',
    'validatableJson',
  ].map(key => [key, { failureCategory: null, outcome: 'verified' }]),
)

const compatibility = {
  generation_with_images: {
    failureCategory: null,
    missingCapabilities: [],
    supported: true,
  },
  generation_without_images: {
    failureCategory: null,
    missingCapabilities: [],
    supported: true,
  },
  invalid_json_repair: {
    failureCategory: null,
    missingCapabilities: [],
    supported: true,
  },
}

function connection(): AiAdminConnectionDetail {
  return {
    activeSecret: { available: false, reason: 'secret_missing' },
    adapterAvailability: { available: true },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: 'Controlled',
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: null,
    attestationDraft: null,
    authenticationType: 'none',
    blockers: [],
    configurationVersion: 1,
    connectionEvidenceId: null,
    dataPolicySummary: 'Synthetic data',
    description: null,
    egressPolicyKey: 'controlled',
    endpointUrl: 'https://controlled.invalid',
    id: '00000000-0000-4000-8000-000000000002',
    lifecycleStatus: 'active',
    maximumConcurrency: 1,
    models: [],
    operationalHealth: 'healthy',
    publicName: 'Controlled',
    revisionToken: '00000000-0000-4000-8000-000000000003',
    tlsPolicyKey: 'controlled',
  }
}

function verificationResponse(): Response {
  const result = {
    attemptExpiresAt: '2026-08-22T12:15:00.000Z',
    attemptId,
    baseline: { failureCategory: null, outcome: 'verified' },
    canonicalExternalModelVersion: null,
    capabilities: verifiedCapabilities,
    connection: { failureCategory: null, outcome: 'verified' },
    profileCompatibility: compatibility,
    saveable: true,
    testSuiteVersion: 'ai-admin-functional-probe-v5',
  }
  const messages = [
    {
      progress: {
        check: 'connection_authentication',
        failureCategory: null,
        outcome: 'not_checked',
        state: 'running',
      },
      type: 'progress',
    },
    {
      progress: {
        check: 'connection_authentication',
        failureCategory: null,
        outcome: 'verified',
        state: 'completed',
      },
      type: 'progress',
    },
    {
      progress: {
        check: 'baseline_model_access',
        failureCategory: 'rate_limited',
        outcome: 'inconclusive',
        state: 'completed',
      },
      type: 'progress',
    },
    { result, type: 'completed' },
  ]
  return new Response(
    `${messages.map(message => JSON.stringify(message)).join('\n')}\n`,
    {
      status: 200,
    },
  )
}

describe('Admin AI model and stable-profile forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('keeps capability truth read-only until one streamed verification is reviewed and saved', async () => {
    fetchMock
      .mockResolvedValueOnce(verificationResponse())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const complete = vi.fn()
    render(
      <ModelForm
        connection={connection()}
        model={null}
        onCancel={vi.fn()}
        onComplete={complete}
      />,
    )
    const user = userEvent.setup()

    expect(
      screen.getAllByText(
        'admin.aiConnections.modelVerification.outcomes.notChecked',
      ),
    ).toHaveLength(7)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await user.type(
      screen.getByLabelText(/^admin\.aiConnections\.fields\.name\.label/),
      'Verified model',
    )
    const externalModelId = screen.getByLabelText(
      /^admin\.aiConnections\.fields\.externalModelId\.label/,
    )
    await user.type(externalModelId, 'controlled/model')
    expect(externalModelId).toHaveValue('controlled/model')
    const verify = screen.getByRole('button', {
      name: 'admin.aiConnections.modelVerification.verify',
    })
    expect(verify).toBeEnabled()
    await user.click(verify)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    await waitFor(() =>
      expect(
        screen.getAllByText(
          'admin.aiConnections.modelVerification.outcomes.verified',
        ).length,
      ).toBeGreaterThanOrEqual(7),
    )
    const progress = screen.getByRole('group', {
      name: 'admin.aiConnections.modelVerification.progress',
    })
    expect(progress).toHaveTextContent(
      'admin.aiConnections.modelVerification.outcomes.inconclusive',
    )
    expect(progress).toHaveTextContent(
      'admin.aiConnections.modelVerification.failureCategories.rate_limited',
    )
    expect(screen.getByText(/resultLabels\.connection/)).toBeInTheDocument()
    expect(screen.getByText(/resultLabels\.baseline/)).toBeInTheDocument()
    const save = screen.getByRole('button', {
      name: 'admin.aiConnections.modelVerification.saveRevision',
    })
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(complete).toHaveBeenCalledOnce())
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({
      action: 'save_model_revision',
      modelRevision: {
        attemptId,
        externalModelId: 'controlled/model',
        name: 'Verified model',
      },
    })
  })

  it('preserves a proof for presentation edits and discards it after a technical edit or close', async () => {
    fetchMock
      .mockResolvedValueOnce(verificationResponse())
      .mockResolvedValue(new Response('{}', { status: 200 }))
    const cancel = vi.fn()
    const registeredClose: Array<() => void> = []
    render(
      <ModelForm
        connection={connection()}
        model={null}
        onCancel={cancel}
        onComplete={vi.fn()}
        onRegisterClose={handler => {
          if (handler) registeredClose.push(handler)
        }}
      />,
    )
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelId\.label/,
      ),
      'controlled/model',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    )
    const save = await screen.findByRole('button', {
      name: 'admin.aiConnections.modelVerification.saveRevision',
    })
    await waitFor(() => expect(save).toBeEnabled())

    await user.type(
      screen.getByLabelText(/^admin\.aiConnections\.fields\.name\.label/),
      'Presentation only',
    )
    expect(save).toBeEnabled()
    await user.type(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelVersion\.label/,
      ),
      'v2',
    )
    expect(save).toBeDisabled()
    await waitFor(() =>
      expect(
        JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
      ).toMatchObject({
        action: 'discard_model_verification',
        attemptId,
      }),
    )

    fetchMock.mockResolvedValueOnce(verificationResponse())
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    )
    await waitFor(() => expect(save).toBeEnabled())
    registeredClose.at(-1)?.()
    expect(cancel).toHaveBeenCalledOnce()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
  })

  it('cancels a verification in flight', async () => {
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      async (_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined
        const encoder = new TextEncoder()
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    progress: {
                      check: 'connection_authentication',
                      failureCategory: null,
                      outcome: 'not_checked',
                      state: 'running',
                    },
                    type: 'progress',
                  })}\n`,
                ),
              )
              requestSignal?.addEventListener('abort', () => {
                controller.error(new DOMException('Aborted', 'AbortError'))
              })
            },
          }),
        )
      },
    )
    render(
      <ModelForm
        connection={connection()}
        model={null}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelId\.label/,
      ),
      'controlled/model',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    )
    const cancelVerification = await screen.findByRole('button', {
      name: 'admin.aiConnections.modelVerification.cancelVerification',
    })
    expect(
      screen.getByRole('listitem', {
        current: 'step',
      }),
    ).toBeInTheDocument()
    await user.click(cancelVerification)
    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
    await screen.findByRole('button', {
      name: 'admin.aiConnections.modelVerification.verify',
    })
  })

  it('shows exact verification and save failures and blocks missing credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(verificationResponse())
      .mockResolvedValueOnce(new Response('save rejected', { status: 400 }))
    const authenticated = connection()
    authenticated.authenticationType = 'static_secret'
    const { rerender } = render(
      <ModelForm
        connection={authenticated}
        model={null}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
    )
    expect(
      screen.getByText('admin.aiConnections.modelVerification.missingSecret'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    ).toBeDisabled()

    const available = connection()
    rerender(
      <ModelForm
        connection={available}
        model={null}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText(/^admin\.aiConnections\.fields\.name\.label/),
      'Model',
    )
    await user.type(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelId\.label/,
      ),
      'controlled/model',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    )
    const save = await screen.findByRole('button', {
      name: 'admin.aiConnections.modelVerification.saveRevision',
    })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('save rejected')
  })

  it('shows incompatible revisions disabled and offers direct disconnection', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const current = connection()
    current.models = [
      {
        description: null,
        id: '00000000-0000-4000-8000-000000000004',
        name: 'Models',
        revisionToken: '00000000-0000-4000-8000-000000000005',
        revisions: [
          {
            agentRuntimeVersion: null,
            connectionConfigurationVersion: 1,
            declaredCapabilities: Object.fromEntries(
              Object.keys(verifiedCapabilities).map(key => [key, true]),
            ) as never,
            discoveredCapabilities: null,
            externalModelId: 'controlled/compatible',
            externalModelVersion: null,
            id: '00000000-0000-4000-8000-000000000006',
            profileCompatibility: compatibility,
            revisionNumber: 1,
            revisionToken: '00000000-0000-4000-8000-000000000007',
            status: 'verified',
            testSuiteVersion: 'ai-admin-functional-probe-v5',
            verifiedAt: '2026-08-22T12:00:00.000Z',
            verifiedCapabilities: Object.fromEntries(
              Object.keys(verifiedCapabilities).map(key => [key, true]),
            ) as never,
          },
          {
            agentRuntimeVersion: null,
            connectionConfigurationVersion: 1,
            declaredCapabilities: {} as never,
            discoveredCapabilities: null,
            externalModelId: 'controlled/ended',
            externalModelVersion: null,
            id: '00000000-0000-4000-8000-000000000008',
            profileCompatibility: compatibility,
            revisionNumber: 2,
            revisionToken: '00000000-0000-4000-8000-000000000009',
            status: 'ended',
            testSuiteVersion: 'ai-admin-functional-probe-v5',
            verifiedAt: '2026-08-22T12:00:00.000Z',
            verifiedCapabilities: {} as never,
          },
        ],
      },
    ]
    const profile: AiAdminRunProfileRecord = {
      blockers: [],
      configurationStatus: 'configured',
      configurationVersion: 3,
      id: '00000000-0000-4000-8000-000000000010',
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 32,
      maximumOutputBytes: 4_194_304,
      maximumOutputTokens: 8_192,
      maximumRetainedMemoryBytes: 8_388_608,
      modelRevisionId: '00000000-0000-4000-8000-000000000006',
      operationalStatus: 'enabled',
      profileKey: 'generation_without_images',
      queueCapacity: 10,
      revisionToken: '00000000-0000-4000-8000-000000000011',
      totalTimeBudgetSeconds: 1200,
    }
    const complete = vi.fn()
    render(
      <ProfileForm
        connections={[current]}
        onCancel={vi.fn()}
        onComplete={complete}
        profile={profile}
      />,
    )
    const select = screen.getByLabelText(
      'admin.aiConnections.directProfile.model',
    )
    const options = within(select).getAllByRole('option')

    expect(options[1]).toHaveTextContent(
      'admin.aiConnections.directProfile.recommended',
    )
    expect(options[1]).toBeEnabled()
    expect(options[2]).toBeDisabled()
    expect(options[2]).toHaveTextContent(
      'admin.aiConnections.directProfile.reasons.ended',
    )
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.directProfile.disconnect',
      }),
    )
    expect(select).toHaveValue('')
    await user.clear(
      screen.getByLabelText(
        'admin.aiConnections.fields.totalTimeBudgetSeconds.label',
      ),
    )
    await user.type(
      screen.getByLabelText(
        'admin.aiConnections.fields.totalTimeBudgetSeconds.label',
      ),
      '900',
    )
    await user.clear(
      screen.getByLabelText(
        'admin.aiConnections.fields.inactivityTimeBudgetSeconds.label',
      ),
    )
    await user.type(
      screen.getByLabelText(
        'admin.aiConnections.fields.inactivityTimeBudgetSeconds.label',
      ),
      '600',
    )
    await user.clear(
      screen.getByLabelText('admin.aiConnections.fields.queueCapacity.label'),
    )
    await user.type(
      screen.getByLabelText('admin.aiConnections.fields.queueCapacity.label'),
      '8',
    )
    for (const key of [
      'maximumOutputTokens',
      'maximumOutputBytes',
      'maximumRetainedMemoryBytes',
      'maximumBufferedEvents',
    ]) {
      const input = screen.getByLabelText(
        `admin.aiConnections.directProfile.fields.${key}.label`,
      )
      await user.clear(input)
      await user.type(input, '64')
    }
    await user.click(
      screen.getByRole('button', { name: 'admin.aiConnections.actions.save' }),
    )
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      maximumBufferedEvents: 64,
      modelRevisionId: null,
      queueCapacity: 8,
      totalTimeBudgetSeconds: 900,
    })
  })
})
