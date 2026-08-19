import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiConnectionsPanel from '@/app/[locale]/admin/panels/settings/ai-connections-panel'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'

const fetchMock = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

const capabilities = {
  aiAnalysis: true,
  cost: true,
  imageInput: false,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

function detail(id: string, name: string): AiAdminConnectionDetail {
  return {
    activeSecret: { available: false, reason: 'secret_missing' },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: name,
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: null,
    authenticationType: 'none',
    blockers: [
      { code: 'attestation_invalid' },
      { code: 'connection_verification_missing' },
      { code: 'model_revision_unverified' },
    ],
    configurationVersion: 1,
    connectionEvidenceId: null,
    dataPolicySummary: 'No production data.',
    description: `${name} demo template`,
    egressPolicyKey: 'controlled_test',
    endpointUrl: 'https://localhost:4443',
    id,
    lifecycleStatus: 'draft',
    maximumConcurrency: 1,
    models: [
      {
        description: null,
        id: `${id}-model`,
        name: `${name} model`,
        revisions: [
          {
            agentRuntimeVersion: null,
            connectionConfigurationVersion: 1,
            declaredCapabilities: capabilities,
            discoveredCapabilities: null,
            externalModelId: 'controlled/model',
            externalModelVersion: '1',
            id: `${id}-revision`,
            revisionNumber: 1,
            revisionToken: `${id}-revision-token`,
            status: 'verification_required',
            verifiedCapabilities: null,
          },
        ],
        revisionToken: `${id}-model-token`,
      },
    ],
    operationalHealth: 'unknown',
    publicName: name,
    provenance: 'administrator',
    revisionToken: `${id}-token`,
    tlsPolicyKey: 'controlled_test',
  } as AiAdminConnectionDetail
}

const connectionOne = detail(
  '10000000-0000-4000-8000-000000000001',
  'Controlled one',
)
const connectionTwo = {
  ...detail('10000000-0000-4000-8000-000000000002', 'Controlled two'),
  provenance: 'demo_seed',
} as AiAdminConnectionDetail

function installRegistryFetch() {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/admin/ai-connections') {
      return Promise.resolve(
        okJson([
          {
            administrationName: connectionOne.administrationName,
            configurationVersion: 1,
            id: connectionOne.id,
            lifecycleStatus: 'draft',
            operationalHealth: 'unknown',
            provenance: 'administrator',
            publicName: connectionOne.publicName,
            revisionToken: connectionOne.revisionToken,
          },
          {
            administrationName: connectionTwo.administrationName,
            configurationVersion: 1,
            id: connectionTwo.id,
            lifecycleStatus: 'draft',
            operationalHealth: 'unknown',
            provenance: 'demo_seed',
            publicName: connectionTwo.publicName,
            revisionToken: connectionTwo.revisionToken,
          },
        ]),
      )
    }
    if (url === `/api/admin/ai-connections/${connectionOne.id}`) {
      return Promise.resolve(okJson(connectionOne))
    }
    if (url === `/api/admin/ai-connections/${connectionTwo.id}`) {
      return Promise.resolve(okJson(connectionTwo))
    }
    if (url === '/api/admin/ai-run-profiles') {
      return Promise.resolve(okJson([]))
    }
    if (url.includes('/api/admin/ai-run-profiles/')) {
      return Promise.resolve(okJson([]))
    }
    return Promise.reject(new Error(`Unexpected fetch ${url}`))
  })
}

describe('AiConnectionsPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    installRegistryFetch()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('starts collapsed, separates lifecycle from health, and expands one row', async () => {
    const { container } = render(
      <ConfirmModalProvider>
        <AiConnectionsPanel />
      </ConfirmModalProvider>,
    )

    expect(
      container.querySelector(
        '[data-developer-mode-name="AI connection registry"]',
      ),
    ).toHaveAttribute('data-developer-mode-context', 'admin settings')

    const first = await screen.findByRole('button', {
      name: /Controlled one/,
    })
    const second = screen.getByRole('button', { name: /Controlled two/ })
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getAllByText('admin.aiConnections.lifecycle.draft'),
    ).toHaveLength(2)
    expect(
      screen.getAllByText('admin.aiConnections.health.unknown'),
    ).toHaveLength(2)

    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.queryByText('admin.aiConnections.seed.demoDraft'),
    ).not.toBeInTheDocument()
    const firstRegion = container.querySelector(
      `#ai-connection-${connectionOne.id}`,
    )
    expect(firstRegion).toHaveAttribute('data-state', 'open')
    expect(firstRegion).toHaveClass('motion-reduce:transition-none')

    fireEvent.click(second)
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(firstRegion).toHaveAttribute('data-state', 'closed')
    expect(screen.queryByText('Controlled one demo template')).not.toBeVisible()
  })

  it('uses explicit seed provenance without inferring it from editable prose', async () => {
    const user = userEvent.setup()
    installRegistryFetch()
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    expect(
      screen.queryByText('admin.aiConnections.seed.demoDraft'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Controlled two/ }))
    expect(
      await screen.findByText('admin.aiConnections.seed.demoDraft'),
    ).toBeVisible()
  })

  it('writes a secret without ever rendering its plaintext', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (
          url === `/api/admin/ai-connections/${connectionOne.id}/actions` &&
          init?.method === 'POST'
        ) {
          return Promise.resolve(
            okJson({
              id: '30000000-0000-4000-8000-000000000001',
              revisionNumber: 1,
              revisionToken: '30000000-0000-4000-8000-000000000002',
              rootKeyVersion: 'test',
              status: 'candidate',
            }),
          )
        }
        return installRegistryResponse(input)
      },
    )

    render(
      <ConfirmModalProvider>
        <AiConnectionsPanel />
      </ConfirmModalProvider>,
    )
    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageSecret',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    const secret = within(dialog).getByLabelText(
      /admin\.aiConnections\.fields\.secret\.label/,
      { selector: 'input' },
    )
    await user.type(secret, 'never-render-me')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.secret.writeCandidate',
      }),
    )

    await waitFor(() => expect(secret).toHaveValue(''))
    expect(screen.queryByText('never-render-me')).not.toBeInTheDocument()
    const request = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/actions') && init?.method === 'POST',
    )
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      action: 'write_secret',
      secret: 'never-render-me',
    })
  })

  it('shows a bounded load error and recovers through the public retry action', async () => {
    const user = userEvent.setup()
    let failConnectionRead = true
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/ai-connections' && failConnectionRead) {
        failConnectionRead = false
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return installRegistryResponse(input)
    })

    renderPanel()

    expect(
      await screen.findByRole('alert', {
        name: '',
      }),
    ).toHaveTextContent('admin.aiConnections.loadError')
    await user.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(
      await screen.findByRole('button', { name: /Controlled one/ }),
    ).toBeVisible()
  })

  it('renders the distinct lifecycle, health, model, and recovery variants', async () => {
    const user = userEvent.setup()
    const variants: AiAdminConnectionDetail[] = [
      {
        ...connectionOne,
        administrationName: 'Retired connection',
        attestation: {
          decisionReference: 'DEC-1',
          id: '90000000-0000-4000-8000-000000000001',
          incidentResponseReference: null,
          isPersonalDataProcessed: false,
          isTrainingAllowed: false,
          maximumInformationClass: 'internal',
          maximumRetentionDays: 0,
          processingRegions: ['SE'],
          providerName: 'Provider',
          purpose: 'Purpose',
          responsibleOrganizationUnitReference: null,
          reviewDueAt: null,
          reviewedAt: '2026-08-19T00:00:00.000Z',
          revisionNumber: 1,
          revisionToken: '90000000-0000-4000-8000-000000000002',
          status: 'valid',
          subprocessors: [],
        },
        blockers: [],
        description: null,
        lifecycleStatus: 'retired',
        models: [],
        operationalHealth: 'unavailable',
      },
      {
        ...connectionTwo,
        administrationName: 'Suspended connection',
        lifecycleStatus: 'suspended',
        models: [
          {
            ...connectionTwo.models[0],
            revisions: [
              {
                ...connectionTwo.models[0].revisions[0],
                status: 'retired',
              },
            ],
          },
        ],
        operationalHealth: 'degraded',
      },
      {
        ...detail(
          '10000000-0000-4000-8000-000000000003',
          'Verification connection',
        ),
        lifecycleStatus: 'verification_required',
        models: [
          {
            description: null,
            id: '10000000-0000-4000-8000-000000000004',
            name: 'Pending model',
            revisions: [],
            revisionToken: '10000000-0000-4000-8000-000000000005',
          },
        ],
      },
    ]
    const suspendedProfile = {
      ...profile,
      activeRevisionId: '90000000-0000-4000-8000-000000000003',
      blockers: [{ code: 'connection_inactive' as const, field: 'connection' }],
      draftRevision: null,
      operationalStatus: 'suspended' as const,
    }
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/ai-connections') {
        return Promise.resolve(
          okJson(
            variants.map(connection => ({
              administrationName: connection.administrationName,
              configurationVersion: connection.configurationVersion,
              id: connection.id,
              lifecycleStatus: connection.lifecycleStatus,
              operationalHealth: connection.operationalHealth,
              publicName: connection.publicName,
              revisionToken: connection.revisionToken,
            })),
          ),
        )
      }
      const connection = variants.find(item =>
        url.endsWith(`/ai-connections/${item.id}`),
      )
      if (connection) return Promise.resolve(okJson(connection))
      if (url === '/api/admin/ai-run-profiles') {
        return Promise.resolve(okJson([suspendedProfile]))
      }
      if (url.includes('/api/admin/ai-run-profiles/')) {
        return Promise.resolve(
          okJson([{ ...profile.draftRevision, modelRevisionId: null }]),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`))
    })

    renderPanel()

    expect(
      await screen.findByText('admin.aiConnections.lifecycle.retired'),
    ).toBeVisible()
    expect(
      screen.getByText('admin.aiConnections.health.unavailable'),
    ).toBeVisible()
    expect(
      screen.getByText('admin.aiConnections.lifecycle.suspended'),
    ).toBeVisible()
    expect(
      screen.getByText('admin.aiConnections.health.degraded'),
    ).toBeVisible()
    expect(
      screen.getByText('admin.aiConnections.lifecycle.verification_required'),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Retired connection/ }))
    expect(
      screen.getByText('admin.aiConnections.values.noDescription'),
    ).toBeVisible()
    expect(screen.getByText('admin.aiConnections.model.empty')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: /Suspended connection/ }),
    )
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.recoverConnection',
      }),
    ).toBeDisabled()
    expect(
      screen.getByText('admin.aiConnections.model.status.retired'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.createProfileRevision',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.recoverProfile',
      }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: /Verification connection/ }),
    )
    expect(screen.queryByText('Pending model')).not.toBeInTheDocument()
  })
})

function installRegistryResponse(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  if (url === '/api/admin/ai-connections') {
    return Promise.resolve(
      okJson([
        {
          administrationName: connectionOne.administrationName,
          configurationVersion: 1,
          id: connectionOne.id,
          lifecycleStatus: 'draft',
          operationalHealth: 'unknown',
          publicName: connectionOne.publicName,
          revisionToken: connectionOne.revisionToken,
        },
      ]),
    )
  }
  if (url === `/api/admin/ai-connections/${connectionOne.id}`) {
    return Promise.resolve(okJson(connectionOne))
  }
  if (url === '/api/admin/ai-run-profiles') return Promise.resolve(okJson([]))
  if (url.includes('/api/admin/ai-run-profiles/')) {
    return Promise.resolve(okJson([]))
  }
  return Promise.reject(new Error(`Unexpected fetch ${url}`))
}

function installRegistryResponseForBoth(
  input: RequestInfo | URL,
): Promise<Response> {
  const url = String(input)
  if (url === '/api/admin/ai-connections') {
    return Promise.resolve(okJson([connectionOne, connectionTwo]))
  }
  if (url === `/api/admin/ai-connections/${connectionOne.id}`) {
    return Promise.resolve(okJson(connectionOne))
  }
  if (url === `/api/admin/ai-connections/${connectionTwo.id}`) {
    return Promise.resolve(okJson(connectionTwo))
  }
  if (url === '/api/admin/ai-run-profiles') return Promise.resolve(okJson([]))
  if (url.includes('/api/admin/ai-run-profiles/')) {
    return Promise.resolve(okJson([]))
  }
  return Promise.reject(new Error(`Unexpected fetch ${url}`))
}

function installWorkflowFetch(options?: {
  connection?: AiAdminConnectionDetail
  profiles?: unknown[]
  revisions?: unknown[]
  mutation?: (body: Record<string, unknown>) => unknown
}) {
  const connection = options?.connection ?? connectionOne
  const profiles = options?.profiles ?? []
  const revisions = options?.revisions ?? []
  fetchMock.mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (method !== 'GET') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<
          string,
          unknown
        >
        return Promise.resolve(okJson(options?.mutation?.(body) ?? {}))
      }
      if (url === '/api/admin/ai-connections') {
        return Promise.resolve(
          okJson([
            {
              administrationName: connection.administrationName,
              configurationVersion: connection.configurationVersion,
              id: connection.id,
              lifecycleStatus: connection.lifecycleStatus,
              operationalHealth: connection.operationalHealth,
              publicName: connection.publicName,
              revisionToken: connection.revisionToken,
            },
          ]),
        )
      }
      if (url === `/api/admin/ai-connections/${connection.id}`) {
        return Promise.resolve(okJson(connection))
      }
      if (url === '/api/admin/ai-run-profiles') {
        return Promise.resolve(okJson(profiles))
      }
      if (url.includes('/api/admin/ai-run-profiles/')) {
        return Promise.resolve(okJson(revisions))
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
    },
  )
}

function renderPanel() {
  return render(
    <ConfirmModalProvider>
      <AiConnectionsPanel />
    </ConfirmModalProvider>,
  )
}

function field(
  dialog: HTMLElement,
  name: string,
  selector: 'input' | 'select' | 'textarea' = 'input',
) {
  return within(dialog).getByLabelText(
    new RegExp(`admin\\.aiConnections\\.fields\\.${name}\\.label`),
    { selector },
  )
}

const profile = {
  activeRevisionId: null,
  blockers: [],
  draftRevision: {
    capabilityPolicy: {
      aiAnalysis: 'allowed',
      imageInput: 'disabled',
      jsonSchema: 'required',
      streaming: 'required',
      usageMetadata: 'allowed',
      validatableJson: 'required',
    },
    id: '40000000-0000-4000-8000-000000000001',
    inactivityTimeBudgetSeconds: 300,
    modelRevisionId: connectionOne.models[0].revisions[0].id,
    queueCapacity: 10,
    revisionNumber: 1,
    revisionToken: '40000000-0000-4000-8000-000000000002',
    status: 'draft',
    totalTimeBudgetSeconds: 1200,
  },
  id: '50000000-0000-4000-8000-000000000001',
  operationalStatus: 'enabled',
  profileKey: 'generation_without_images',
  revisionToken: '50000000-0000-4000-8000-000000000002',
}

describe('AiConnectionsPanel workflows', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('creates and edits connections through translated modal fields', async () => {
    const user = userEvent.setup()
    installWorkflowFetch()
    renderPanel()

    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.addConnection',
      }),
    )
    let dialog = await screen.findByRole('dialog')
    await user.type(field(dialog, 'administrationName'), 'New connection')
    await user.type(field(dialog, 'publicName'), 'New public name')
    await user.type(field(dialog, 'adapterKey'), 'controlled_test')
    await user.type(field(dialog, 'adapterVersion'), '1')
    await user.type(field(dialog, 'endpointUrl'), 'https://localhost:4443')
    await user.type(field(dialog, 'tlsPolicyKey'), 'controlled_test')
    await user.type(field(dialog, 'egressPolicyKey'), 'controlled_test')
    await user.selectOptions(
      field(dialog, 'authenticationType', 'select'),
      'none',
    )
    await user.type(
      field(dialog, 'dataPolicySummary', 'textarea'),
      'No production data.',
    )
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveConnection',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      JSON.parse(
        String(
          fetchMock.mock.calls.find(
            ([url, init]) =>
              String(url) === '/api/admin/ai-connections' &&
              init?.method === 'POST',
          )?.[1]?.body,
        ),
      ),
    ).toMatchObject({
      adapterKey: 'controlled_test',
      administrationName: 'New connection',
      authenticationType: 'none',
    })

    await user.click(screen.getByRole('button', { name: /Controlled one/ }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.editConnection',
      }),
    )
    dialog = await screen.findByRole('dialog')
    const name = field(dialog, 'administrationName')
    await user.clear(name)
    await user.type(name, 'Edited connection')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveConnection',
      }),
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith(connectionOne.id) && init?.method === 'PATCH',
        ),
      ).toBe(true),
    )
  })

  it('saves model and profile drafts with their explicit capability policies', async () => {
    const user = userEvent.setup()
    installWorkflowFetch({
      profiles: [profile],
      revisions: [profile.draftRevision],
    })
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addModel',
      }),
    )
    let dialog = await screen.findByRole('dialog')
    await user.type(field(dialog, 'name'), 'Controlled new model')
    await user.type(field(dialog, 'externalModelId'), 'controlled/new')
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'admin.aiConnections.capabilities.streaming',
      }),
    )
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveModel',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const modelRequest = fetchMock.mock.calls.find(([, init]) => {
      if (init?.method !== 'POST') return false
      return String(init.body).includes('save_model_revision')
    })
    expect(JSON.parse(String(modelRequest?.[1]?.body))).toMatchObject({
      action: 'save_model_revision',
      modelRevision: {
        externalModelId: 'controlled/new',
        name: 'Controlled new model',
      },
    })

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.editProfile',
      }),
    )
    dialog = await screen.findByRole('dialog')
    await user.selectOptions(
      field(dialog, 'modelRevisionId', 'select'),
      connectionOne.models[0].revisions[0].id,
    )
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.profile.saveDraft',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const profileRequest = fetchMock.mock.calls.find(([, init]) => {
      if (init?.method !== 'POST') return false
      const value = JSON.parse(String(init.body)) as Record<string, unknown>
      return 'capabilityPolicy' in value
    })
    expect(JSON.parse(String(profileRequest?.[1]?.body))).toMatchObject({
      capabilityPolicy: {
        jsonSchema: 'required',
        streaming: 'required',
      },
      modelRevisionId: connectionOne.models[0].revisions[0].id,
      queueCapacity: 10,
    })
  })

  it('offers translated help for every declared model capability', async () => {
    const user = userEvent.setup()
    installWorkflowFetch()
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addModel',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    for (const capability of [
      'aiAnalysis',
      'cost',
      'imageInput',
      'jsonSchemaSteering',
      'streaming',
      'tokenUsage',
      'validatableJson',
    ]) {
      const label = `admin.aiConnections.capabilities.${capability}`
      await user.click(
        within(dialog).getByRole('button', { name: `common.help: ${label}` }),
      )
      expect(
        within(dialog).getByText(
          `admin.aiConnections.capabilityHelp.${capability}`,
        ),
      ).toBeVisible()
    }
  })

  it('locks fixed profile minima and starts new drafts from profile-specific policies', async () => {
    const user = userEvent.setup()
    const profiles = [
      {
        ...profile,
        draftRevision: null,
        id: '51000000-0000-4000-8000-000000000001',
        profileKey: 'generation_with_images',
      },
      {
        ...profile,
        draftRevision: null,
        id: '51000000-0000-4000-8000-000000000002',
        profileKey: 'invalid_json_repair',
      },
    ]
    installWorkflowFetch({ profiles })
    renderPanel()

    await screen.findByRole('button', { name: /Controlled one/ })
    const imageProfile = screen
      .getByRole('heading', {
        name: 'admin.aiConnections.profiles.generation_with_images',
      })
      .closest('article')
    expect(imageProfile).not.toBeNull()
    await user.click(
      within(imageProfile as HTMLElement).getByRole('button', {
        name: 'admin.aiConnections.actions.createProfileRevision',
      }),
    )
    let dialog = await screen.findByRole('dialog')
    const imageInput = within(dialog).getByLabelText(
      'admin.aiConnections.policy.imageInput.label',
      { selector: 'select' },
    )
    expect(imageInput).toHaveValue('required')
    expect(imageInput).toBeDisabled()
    expect(
      within(dialog).getAllByText('admin.aiConnections.profile.lockedMinimum'),
    ).toHaveLength(3)
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.cancel',
      }),
    )

    const repairProfile = screen
      .getByRole('heading', {
        name: 'admin.aiConnections.profiles.invalid_json_repair',
      })
      .closest('article')
    expect(repairProfile).not.toBeNull()
    await user.click(
      within(repairProfile as HTMLElement).getByRole('button', {
        name: 'admin.aiConnections.actions.createProfileRevision',
      }),
    )
    dialog = await screen.findByRole('dialog')
    for (const capability of ['streaming', 'aiAnalysis']) {
      const input = within(dialog).getByLabelText(
        `admin.aiConnections.policy.${capability}.label`,
        { selector: 'select' },
      )
      expect(input).toHaveValue('disabled')
      expect(input).toBeDisabled()
    }
  })

  it('allows a replacement draft to attempt activation despite active-profile blockers', async () => {
    const blockedActiveProfile = {
      ...profile,
      blockers: [
        { code: 'capability_policy_invalid' as const, field: 'imageInput' },
      ],
    }
    installWorkflowFetch({
      profiles: [blockedActiveProfile],
      revisions: [blockedActiveProfile.draftRevision],
    })
    renderPanel()

    const activate = await screen.findByRole('button', {
      name: 'admin.aiConnections.actions.activateProfile',
    })
    expect(activate).toBeEnabled()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent?.includes(
            'admin.aiConnections.blockerFields.imageInput',
          ) === true,
      ),
    ).toBeVisible()
  })

  it('renders candidate blockers returned when replacement activation is rejected', async () => {
    const user = userEvent.setup()
    installWorkflowFetch({
      profiles: [profile],
      revisions: [profile.draftRevision],
    })
    const successfulFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          init?.method === 'POST' &&
          String(init.body).includes('activate_revision')
        ) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                details: {
                  blockers: [
                    {
                      code: 'capability_policy_invalid',
                      field: 'validatableJson',
                    },
                  ],
                },
                message: 'Candidate is blocked',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 422,
              },
            ),
          )
        }
        return successfulFetch?.(input, init)
      },
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.activateProfile',
      }),
    )
    expect(
      await screen.findByText('admin.aiConnections.profile.candidateBlockers'),
    ).toBeVisible()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent?.includes(
            'admin.aiConnections.blockerFields.validatableJson',
          ) === true,
      ),
    ).toBeVisible()
  })

  it('shows only active or draft profile impact and names blocker fields', async () => {
    const user = userEvent.setup()
    const historicalProfile = {
      ...profile,
      blockers: [
        { code: 'capability_policy_invalid' as const, field: 'streaming' },
      ],
      draftRevision: null,
    }
    installWorkflowFetch({
      profiles: [historicalProfile],
      revisions: [
        {
          ...profile.draftRevision,
          status: 'superseded',
        },
      ],
    })
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    expect(
      screen.getByText('admin.aiConnections.profile.noImpact'),
    ).toBeVisible()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent?.includes(
            'admin.aiConnections.blockerFields.streaming',
          ) === true,
      ),
    ).toBeVisible()
  })

  it('keeps catalog results owned by the connection that produced them', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            okJson([
              {
                capabilities,
                externalModelId: 'controlled/one',
                externalModelVersion: '1',
                name: 'Only connection one catalog model',
              },
            ]),
          )
        }
        return installRegistryResponseForBoth(input)
      },
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    )
    expect(
      await screen.findByText(/admin\.aiConnections\.catalog\.result/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Controlled two/ }))
    expect(
      screen.queryByText(/admin\.aiConnections\.catalog\.result/),
    ).not.toBeVisible()
  })

  it('keeps attestation save and approval as separate mutations', async () => {
    const user = userEvent.setup()
    const saved = {
      decisionReference: 'DEC-1',
      id: '60000000-0000-4000-8000-000000000001',
      incidentResponseReference: '60000000-0000-4000-8000-000000000002',
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'Controlled provider',
      purpose: 'Controlled test',
      responsibleOrganizationUnitReference:
        '60000000-0000-4000-8000-000000000003',
      reviewDueAt: '2099-01-01T00:00:00.000Z',
      reviewedAt: '2026-08-19T00:00:00.000Z',
      revisionNumber: 1,
      revisionToken: '60000000-0000-4000-8000-000000000004',
      status: 'draft',
      subprocessors: [],
    }
    installWorkflowFetch({
      mutation: body =>
        body.action === 'save_attestation'
          ? saved
          : { ...saved, status: 'valid' },
    })
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageAttestation',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    const values: Record<string, string> = {
      decisionReference: 'DEC-1',
      incidentResponseReference: saved.incidentResponseReference,
      maximumInformationClass: 'internal',
      maximumRetentionDays: '0',
      processingRegions: 'SE',
      providerName: 'Controlled provider',
      purpose: 'Controlled test',
      responsibleOrganizationUnitReference:
        saved.responsibleOrganizationUnitReference,
      reviewedAt: saved.reviewedAt,
    }
    for (const [name, value] of Object.entries(values)) {
      const selector = name === 'purpose' ? 'textarea' : 'input'
      await user.type(field(dialog, name, selector), value)
    }
    await user.selectOptions(
      field(dialog, 'isPersonalDataProcessed', 'select'),
      'false',
    )
    await user.selectOptions(
      field(dialog, 'isTrainingAllowed', 'select'),
      'false',
    )
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.attestation.saveDraft',
      }),
    )
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'admin.aiConnections.attestation.approve',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const actionBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)))
    expect(actionBodies.map(body => body.action)).toEqual([
      'save_attestation',
      'attest',
    ])
    expect(actionBodies[1].attestation).not.toHaveProperty('id')
    expect(actionBodies[1].attestation).not.toHaveProperty('status')
  })

  it('deletes and activates secret candidates and confirms provider revocation', async () => {
    const user = userEvent.setup()
    const secretConnection: AiAdminConnectionDetail = {
      ...connectionOne,
      activeSecret: {
        available: true,
        rootKeyVersion: 'test',
        secretVersionId: '80000000-0000-4000-8000-000000000001',
      },
    }
    let candidateNumber = 0
    installWorkflowFetch({
      connection: secretConnection,
      mutation: body =>
        body.action === 'write_secret'
          ? {
              id: `80000000-0000-4000-8000-00000000000${++candidateNumber}`,
            }
          : {},
    })
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageSecret',
      }),
    )
    let dialog = await screen.findByRole('dialog')
    let secret = field(dialog, 'secret')
    await user.type(secret, 'first-candidate')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.secret.writeCandidate',
      }),
    )
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'admin.aiConnections.secret.deleteCandidate',
      }),
    )
    let confirmDialog = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.aiConnections.secret.deleteCandidate',
      }),
    )
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', {
          name: 'admin.aiConnections.secret.activateCandidate',
        }),
      ).toBeNull(),
    )

    secret = field(dialog, 'secret')
    await user.type(secret, 'second-candidate')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.secret.writeCandidate',
      }),
    )
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'admin.aiConnections.secret.activateCandidate',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageSecret',
      }),
    )
    dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.secret.confirmRevocation',
      }),
    )
    confirmDialog = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.aiConnections.secret.confirmRevocation',
      }),
    )

    await waitFor(() => {
      const actions = fetchMock.mock.calls
        .filter(([, init]) => init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)).action)
      expect(actions).toEqual(
        expect.arrayContaining([
          'delete_secret_candidate',
          'activate_secret',
          'confirm_secret_revocation',
        ]),
      )
    })
    expect(screen.queryByText('first-candidate')).not.toBeInTheDocument()
    expect(screen.queryByText('second-candidate')).not.toBeInTheDocument()
  })

  it('surfaces a safe API mutation failure and leaves the modal recoverable', async () => {
    const user = userEvent.setup()
    installWorkflowFetch({ mutation: () => ({}) })
    const successfulFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ message: 'Safe conflict' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 409,
            }),
          )
        }
        return successfulFetch?.(input, init)
      },
    )
    renderPanel()
    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.addConnection',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(field(dialog, 'administrationName'), 'Rejected')
    await user.type(field(dialog, 'publicName'), 'Rejected')
    await user.type(field(dialog, 'adapterKey'), 'controlled_test')
    await user.type(field(dialog, 'adapterVersion'), '1')
    await user.type(field(dialog, 'endpointUrl'), 'https://localhost:4443')
    await user.type(field(dialog, 'tlsPolicyKey'), 'controlled_test')
    await user.type(field(dialog, 'egressPolicyKey'), 'controlled_test')
    await user.type(
      field(dialog, 'dataPolicySummary', 'textarea'),
      'No production data.',
    )
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveConnection',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Safe conflict')
    expect(dialog).toBeVisible()
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.cancel',
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('executes bounded verification, recovery, profile, catalog, and confirmed retirement actions', async () => {
    const user = userEvent.setup()
    const readyConnection = {
      ...connectionOne,
      blockers: [],
      connectionEvidenceId: '70000000-0000-4000-8000-000000000001',
      lifecycleStatus: 'active' as const,
      models: [
        {
          ...connectionOne.models[0],
          revisions: [
            {
              ...connectionOne.models[0].revisions[0],
              status: 'verified' as const,
              verifiedCapabilities: capabilities,
            },
          ],
        },
      ],
      operationalHealth: 'healthy' as const,
    }
    const readyProfile = {
      ...profile,
      draftRevision: {
        ...profile.draftRevision,
        modelRevisionId: readyConnection.models[0].revisions[0].id,
      },
    }
    installWorkflowFetch({
      connection: readyConnection,
      mutation: body =>
        body.action === 'fetch_catalog'
          ? [
              {
                capabilities,
                externalModelId: 'controlled/model',
                externalModelVersion: '1',
                name: 'Controlled model',
              },
            ]
          : {},
      profiles: [readyProfile],
      revisions: [readyProfile.draftRevision],
    })
    renderPanel()
    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    for (const name of [
      'admin.aiConnections.actions.fetchCatalog',
      'admin.aiConnections.actions.verifyConnection',
      'admin.aiConnections.actions.probeHealth',
      'admin.aiConnections.actions.suspendConnection',
    ]) {
      await user.click(screen.getByRole('button', { name }))
    }
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.activateProfile',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.suspendProfile',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.retireModel',
      }),
    )
    let confirmDialog = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.aiConnections.actions.retireModel',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.retireConnection',
      }),
    )
    confirmDialog = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.aiConnections.actions.retireConnection',
      }),
    )

    await waitFor(() => {
      const actionBodies = fetchMock.mock.calls
        .filter(([, init]) => init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)).action)
      expect(actionBodies).toEqual(
        expect.arrayContaining([
          'fetch_catalog',
          'verify_connection',
          'probe_health',
          'set_lifecycle',
          'activate_revision',
          'set_operational_status',
          'retire_model_revision',
        ]),
      )
    })
    expect(
      screen.getByText(/admin\.aiConnections\.catalog\.result/),
    ).toBeVisible()
  })
})
