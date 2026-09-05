import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ModelForm,
  ProfileForm,
} from '@/app/[locale]/admin/panels/settings/ai-connections/model-profile-forms'
import type {
  AiAdminCatalogItem,
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
    'reasoning',
    'reasoningControl',
    'aiAnalysis',
    'cost',
    'imageInput',
    'jsonSchemaSteering',
    'streaming',
    'tokenUsage',
    'validatableJson',
  ].map(key => [
    key,
    { diagnosticCode: null, failureCategory: null, outcome: 'verified' },
  ]),
)

const compatibility = {
  generation_with_images: {
    diagnosticCode: null,
    failureCategory: null,
    missingCapabilities: [],
    outcome: 'verified',
    supported: true,
  },
  generation_without_images: {
    diagnosticCode: null,
    failureCategory: null,
    missingCapabilities: [],
    outcome: 'verified',
    supported: true,
  },
  invalid_json_repair: {
    diagnosticCode: null,
    failureCategory: null,
    missingCapabilities: [],
    outcome: 'verified',
    supported: true,
  },
} as const

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

function catalogItem(
  overrides: Partial<AiAdminCatalogItem>,
): AiAdminCatalogItem {
  return {
    capabilities: {} as never,
    externalModelId: 'catalog/model',
    externalModelVersion: null,
    inputPricePerMillionTokens: null,
    modelProviderName: null,
    name: 'Catalog model',
    outputPricePerMillionTokens: null,
    ...overrides,
  }
}

function stableProfile(
  overrides: Partial<AiAdminRunProfileRecord> = {},
): AiAdminRunProfileRecord {
  return {
    blockers: [],
    configurationStatus: 'configured',
    configurationVersion: 3,
    id: '00000000-0000-4000-8000-000000000010',
    inactivityTimeBudgetSeconds: 300,
    maximumBufferedEvents: 32,
    maximumOutputBytes: 4_194_304,
    maximumOutputTokens: 8_192,
    maximumRetainedMemoryBytes: 8_388_608,
    modelRevisionId: null,
    operationalStatus: 'enabled',
    profileKey: 'generation_without_images',
    queueCapacity: 10,
    revisionToken: '00000000-0000-4000-8000-000000000011',
    totalTimeBudgetSeconds: 1200,
    ...overrides,
    administrativeStatus: overrides.administrativeStatus ?? 'active',
  }
}

type ModelRevision =
  AiAdminConnectionDetail['models'][number]['revisions'][number]

function modelRevision(
  id: string,
  overrides: Partial<ModelRevision> = {},
): ModelRevision {
  return {
    reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
    agentRuntimeVersion: null,
    connectionConfigurationVersion: 1,
    declaredCapabilities: {} as never,
    discoveredCapabilities: null,
    externalModelId: `controlled/${id}`,
    externalModelVersion: null,
    id,
    profileCompatibility: compatibility,
    revisionNumber: 1,
    revisionToken: `${id}-token`,
    status: 'verified',
    testSuiteVersion: 'ai-admin-functional-probe-v2',
    verifiedAt: '2026-08-22T12:00:00.000Z',
    verifiedCapabilities: {} as never,
    ...overrides,
  }
}

function connectionWithRevisions(
  id: string,
  revisions: ModelRevision[],
  overrides: Partial<AiAdminConnectionDetail> = {},
): AiAdminConnectionDetail {
  return {
    ...connection(),
    administrationName: id,
    id,
    models: [
      {
        description: null,
        id: `${id}-model`,
        name: `${id} models`,
        revisions,
        revisionToken: `${id}-model-token`,
      },
    ],
    publicName: id,
    revisionToken: `${id}-connection-token`,
    ...overrides,
  }
}

function verificationResponse(): Response {
  const result = {
    reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
    attemptExpiresAt: '2026-08-22T12:15:00.000Z',
    attemptId,
    baseline: {
      diagnosticCode: null,
      failureCategory: null,
      outcome: 'verified',
    },
    canonicalExternalModelVersion: null,
    capabilities: verifiedCapabilities,
    connection: {
      diagnosticCode: null,
      failureCategory: null,
      outcome: 'verified',
    },
    profileCompatibility: compatibility,
    saveable: true,
    testSuiteVersion: 'ai-admin-functional-probe-v2',
  }
  const messages = [
    {
      progress: {
        check: 'connection_authentication',
        diagnosticCode: null,
        failureCategory: null,
        outcome: 'not_checked',
        state: 'running',
      },
      type: 'progress',
    },
    {
      progress: {
        check: 'connection_authentication',
        diagnosticCode: null,
        failureCategory: null,
        outcome: 'verified',
        state: 'completed',
      },
      type: 'progress',
    },
    {
      progress: {
        check: 'baseline_model_access',
        diagnosticCode: 'upstream_rate_limited_http_429',
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

function rejectedBaselineVerificationResponse(): Response {
  const notCheckedCapabilities = Object.fromEntries(
    Object.keys(verifiedCapabilities).map(key => [
      key,
      {
        diagnosticCode: null,
        failureCategory: null,
        outcome: 'not_checked',
      },
    ]),
  )
  const notCheckedProfiles = Object.fromEntries(
    Object.keys(compatibility).map(key => [
      key,
      {
        diagnosticCode: null,
        failureCategory: null,
        missingCapabilities: [],
        outcome: 'not_checked',
        supported: false,
      },
    ]),
  )
  const baseline = {
    diagnosticCode: 'upstream_request_rejected_http_400',
    failureCategory: 'request_rejected',
    outcome: 'not_verified',
  }
  const result = {
    reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
    attemptExpiresAt: null,
    attemptId: null,
    baseline,
    canonicalExternalModelVersion: null,
    capabilities: notCheckedCapabilities,
    connection: {
      diagnosticCode: null,
      failureCategory: null,
      outcome: 'verified',
    },
    profileCompatibility: notCheckedProfiles,
    saveable: false,
    testSuiteVersion: 'ai-admin-functional-probe-v2',
  }
  return new Response(
    `${JSON.stringify({
      progress: {
        check: 'baseline_model_access',
        state: 'completed',
        ...baseline,
      },
      type: 'progress',
    })}\n${JSON.stringify({ result, type: 'completed' })}\n`,
    { status: 200 },
  )
}

describe('Admin AI model and stable-profile forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('restores catalog discovery without treating catalog claims as verification', async () => {
    const catalog = [
      catalogItem({
        externalModelId: 'openai/model',
        externalModelVersion: '2026-08',
        inputPricePerMillionTokens: { amount: '1.25', currency: 'USD' },
        modelProviderName: 'openai',
        name: 'OpenAI model',
        outputPricePerMillionTokens: { amount: '5.00', currency: 'USD' },
      }),
      catalogItem({
        externalModelId: 'acme/model',
        modelProviderName: 'acme-labs',
        name: 'Acme model',
      }),
      catalogItem({
        externalModelId: 'other/model',
        name: 'Other model',
      }),
    ]
    const refresh = vi.fn(async () => catalog)
    const props = {
      catalog,
      connection: connection(),
      model: null,
      onCancel: vi.fn(),
      onComplete: vi.fn(),
      onRefreshCatalog: refresh,
    }
    const { rerender } = render(<ModelForm {...props} catalogStatus="loaded" />)
    const user = userEvent.setup()

    expect(
      screen.getByRole('status', {
        name: '',
      }),
    ).toHaveTextContent('admin.aiConnections.catalog.selectionReady')
    expect(
      screen.getByText(
        'admin.aiConnections.modelVerification.capabilitiesHelp',
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: 'common.help: admin.aiConnections.catalog.selectionLabel',
      }),
    )
    expect(
      screen.getByText('admin.aiConnections.catalog.selectionHelp'),
    ).toBeInTheDocument()
    const select = screen.getByLabelText(
      'admin.aiConnections.catalog.selectionLabel',
    )
    expect(within(select).getByRole('group', { name: 'OpenAI' })).toBeDefined()
    expect(
      within(select).getByRole('option', { name: /OpenAI model.*1.25.*5.00/ }),
    ).toBeInTheDocument()
    expect(
      within(select).getByRole('group', { name: 'Acme-labs' }),
    ).toBeDefined()
    expect(
      within(select).getByRole('group', {
        name: 'admin.aiConnections.catalog.otherProvider',
      }),
    ).toBeDefined()

    await user.selectOptions(
      select,
      JSON.stringify(['openai/model', '2026-08']),
    )
    expect(
      screen.getByLabelText(/^admin\.aiConnections\.fields\.name\.label/),
    ).toHaveValue('OpenAI model')
    expect(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelId\.label/,
      ),
    ).toHaveValue('openai/model')
    expect(
      screen.getAllByText(
        'admin.aiConnections.modelVerification.outcomes.notChecked',
      ),
    ).toHaveLength(9)
    await user.selectOptions(select, '')
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    )
    expect(refresh).toHaveBeenCalledOnce()

    rerender(<ModelForm {...props} catalogStatus="loading" />)
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    ).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.aiConnections.catalog.loading',
    )

    rerender(<ModelForm {...props} catalog={[]} catalogStatus="unavailable" />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.aiConnections.catalog.unavailableManual',
    )
  })

  it('prefills model fields from the highest revision number', () => {
    const current = connection()
    const model = {
      description: null,
      id: 'model',
      name: 'Model',
      revisionToken: 'model-token',
      revisions: [
        modelRevision('newest', {
          reasoning: {
            mode: 'explicit_control' as const,
            effort: 'high' as const,
          },
          externalModelId: 'controlled/newest',
          externalModelVersion: '3',
          revisionNumber: 3,
        }),
        modelRevision('older', {
          reasoning: {
            mode: 'explicit_control' as const,
            effort: 'high' as const,
          },
          externalModelId: 'controlled/older',
          externalModelVersion: '1',
          revisionNumber: 1,
        }),
      ],
    }
    current.models = [model]

    render(
      <ModelForm
        connection={current}
        model={model}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelId\.label/,
      ),
    ).toHaveValue('controlled/newest')
    expect(
      screen.getByLabelText(
        /^admin\.aiConnections\.fields\.externalModelVersion\.label/,
      ),
    ).toHaveValue('3')
  })

  it('defaults to High and invalidates verification when effort or path changes', async () => {
    fetchMock
      .mockResolvedValueOnce(verificationResponse())
      .mockResolvedValue(new Response('{}', { status: 200 }))
    render(
      <ModelForm
        connection={connection()}
        model={null}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    const effort = screen.getByRole('combobox', {
      name: /^admin.aiConnections.fields.reasoningEffort.label/,
    })
    expect(effort).toHaveValue('high')
    expect(effort).toHaveAttribute(
      'data-developer-mode-name',
      'AI model reasoning effort',
    )
    await user.type(
      screen.getByLabelText(
        /^admin.aiConnections.fields.externalModelId.label/,
      ),
      'controlled/model',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    )
    const save = screen.getByRole('button', {
      name: 'admin.aiConnections.modelVerification.saveRevision',
    })
    await waitFor(() => expect(save).toBeEnabled())
    await user.selectOptions(effort, 'low')
    expect(save).toBeDisabled()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning).toEqual({
      mode: 'explicit_control',
      effort: 'high',
    })
    fetchMock.mockResolvedValueOnce(
      new Response(
        (await verificationResponse().text()).replace(
          '"mode":"explicit_control","effort":"high"',
          '"mode":"model_default","effort":null',
        ),
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      ),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.verify',
      }),
    )
    await waitFor(() => expect(save).toBeEnabled())
    expect(
      screen.getAllByText('admin.aiConnections.reasoning.modelDefault').length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('combobox', {
        name: /^admin.aiConnections.fields.reasoningEffort.label/,
      }),
    ).toBeNull()
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
    ).toHaveLength(9)
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
    expect(progress).toHaveTextContent(
      'admin.aiConnections.modelVerification.technicalCode upstream_rate_limited_http_429',
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

  it('shows gated capabilities and profiles as not tested with a safe code', async () => {
    fetchMock.mockResolvedValueOnce(rejectedBaselineVerificationResponse())
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

    const resultHeading = await screen.findByRole('heading', {
      name: 'admin.aiConnections.modelVerification.compatibility',
    })
    const result = resultHeading.closest('section')
    if (!result) throw new Error('Verification result section missing.')
    expect(
      within(result).getAllByText(
        'admin.aiConnections.modelVerification.outcomes.notChecked',
        { exact: false },
      ),
    ).toHaveLength(3)
    expect(result).not.toHaveTextContent(
      'admin.aiConnections.modelVerification.unsupported',
    )
    expect(result).toHaveTextContent(
      'admin.aiConnections.modelVerification.technicalCode upstream_request_rejected_http_400',
    )
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

  it('shows transport and streamed verification failures without enabling save', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('verification rejected', { status: 503 }),
    )
    const first = render(
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'verification rejected',
    )
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.modelVerification.saveRevision',
      }),
    ).toBeDisabled()
    first.unmount()

    fetchMock.mockResolvedValueOnce(
      new Response(
        `${JSON.stringify({ error: 'stream rejected', type: 'error' })}\n`,
        { status: 200 },
      ),
    )
    render(
      <ModelForm
        connection={connection()}
        model={null}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
      />,
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'stream rejected',
    )
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
            reasoning: {
              mode: 'explicit_control' as const,
              effort: 'high' as const,
            },
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
            testSuiteVersion: 'ai-admin-functional-probe-v2',
            verifiedAt: '2026-08-22T12:00:00.000Z',
            verifiedCapabilities: Object.fromEntries(
              Object.keys(verifiedCapabilities).map(key => [key, true]),
            ) as never,
          },
          {
            reasoning: {
              mode: 'explicit_control' as const,
              effort: 'high' as const,
            },
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
            testSuiteVersion: 'ai-admin-functional-probe-v2',
            verifiedAt: '2026-08-22T12:00:00.000Z',
            verifiedCapabilities: {} as never,
          },
        ],
      },
    ]
    const profile = stableProfile({
      modelRevisionId: '00000000-0000-4000-8000-000000000006',
    })
    const complete = vi.fn()
    render(
      <ProfileForm
        connections={[current]}
        onCancel={vi.fn()}
        onComplete={complete}
        profile={profile}
      />,
    )
    expect(
      screen.getByText('admin.aiConnections.directProfile.activeChangeNotice'),
    ).toBeInTheDocument()
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
    fireEvent.change(
      screen.getByLabelText(
        'admin.aiConnections.fields.totalTimeBudgetSeconds.label',
      ),
      { target: { value: '900' } },
    )
    fireEvent.change(
      screen.getByLabelText(
        'admin.aiConnections.fields.inactivityTimeBudgetSeconds.label',
      ),
      { target: { value: '600' } },
    )
    fireEvent.change(
      screen.getByLabelText('admin.aiConnections.fields.queueCapacity.label'),
      { target: { value: '8' } },
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
      fireEvent.change(input, { target: { value: '64' } })
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

  it('blocks profile saving while required numeric inputs are empty', async () => {
    render(
      <ProfileForm
        connections={[]}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        profile={stableProfile()}
      />,
    )

    const inputs = [
      'admin.aiConnections.fields.totalTimeBudgetSeconds.label',
      'admin.aiConnections.fields.inactivityTimeBudgetSeconds.label',
      'admin.aiConnections.fields.queueCapacity.label',
      'admin.aiConnections.directProfile.fields.maximumOutputTokens.label',
      'admin.aiConnections.directProfile.fields.maximumOutputBytes.label',
      'admin.aiConnections.directProfile.fields.maximumRetainedMemoryBytes.label',
      'admin.aiConnections.directProfile.fields.maximumBufferedEvents.label',
    ].map(label => screen.getByLabelText(label))
    for (const input of inputs) {
      fireEvent.change(input, {
        target: { value: '' },
      })
    }

    for (const input of inputs) expect(input).toBeInvalid()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.save',
      }),
    ).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains every direct-profile selection blocker and preserves save errors', async () => {
    const usableOlder = modelRevision('usable-older', { revisionNumber: 1 })
    const usableNewest = modelRevision('usable-newest', { revisionNumber: 2 })
    const connections = [
      connectionWithRevisions('usable', [usableNewest, usableOlder]),
      connectionWithRevisions('ended', [
        modelRevision('ended-revision', { status: 'ended' }),
      ]),
      connectionWithRevisions('new-revision', [
        modelRevision('new-revision-required', {
          status: 'new_revision_required',
        }),
      ]),
      connectionWithRevisions(
        'suspended',
        [modelRevision('suspended-revision')],
        { lifecycleStatus: 'suspended' },
      ),
      connectionWithRevisions('blocked', [modelRevision('blocked-revision')], {
        blockers: [{ code: 'attestation_invalid' }],
      }),
      connectionWithRevisions('stale', [
        modelRevision('stale-revision', {
          connectionConfigurationVersion: 0,
        }),
      ]),
      connectionWithRevisions('missing-capability', [
        modelRevision('missing-capability-revision', {
          profileCompatibility: {
            ...compatibility,
            generation_without_images: {
              diagnosticCode: null,
              failureCategory: null,
              missingCapabilities: ['streaming'],
              outcome: 'not_verified',
              supported: false,
            },
          } as never,
        }),
      ]),
      connectionWithRevisions('incompatible', [
        modelRevision('incompatible-revision', {
          profileCompatibility: {
            ...compatibility,
            generation_without_images: {
              diagnosticCode: null,
              failureCategory: null,
              missingCapabilities: [],
              outcome: 'not_verified',
              supported: false,
            },
          },
        }),
      ]),
    ]
    fetchMock.mockResolvedValueOnce(
      new Response('profile rejected', { status: 409 }),
    )
    render(
      <ProfileForm
        connections={connections}
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        profile={stableProfile()}
      />,
    )
    const select = screen.getByLabelText(
      'admin.aiConnections.directProfile.model',
    )
    const options = within(select).getAllByRole('option')

    expect(
      options.filter(option => !option.hasAttribute('disabled')),
    ).toHaveLength(3)
    expect(
      within(select).getByRole('option', { name: /usable.*2.*recommended/ }),
    ).toBeEnabled()
    expect(
      within(select).getByRole('option', {
        name: /directProfile\.reasons\.ended/,
      }),
    ).toBeDisabled()
    expect(
      within(select).getAllByRole('option', {
        name: /directProfile\.reasons\.newRevisionRequired/,
      }),
    ).toHaveLength(2)
    expect(
      within(select).getByRole('option', {
        name: /directProfile\.reasons\.connectionUnavailable/,
      }),
    ).toBeDisabled()
    expect(
      within(select).getByRole('option', {
        name: /blockers\.attestation_invalid/,
      }),
    ).toBeDisabled()
    expect(
      within(select).getByRole('option', {
        name: /directProfile\.reasons\.missingCapabilities/,
      }),
    ).toHaveTextContent('admin.aiConnections.capabilities.streaming')
    expect(
      within(select).getByRole('option', {
        name: /directProfile\.reasons\.incompatible/,
      }),
    ).toBeDisabled()

    const user = userEvent.setup()
    await user.selectOptions(select, usableOlder.id)
    await user.click(
      screen.getByRole('button', { name: 'admin.aiConnections.actions.save' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'profile rejected',
    )
  })
})
