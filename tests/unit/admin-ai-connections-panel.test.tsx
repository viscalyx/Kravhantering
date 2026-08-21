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
const translationState = vi.hoisted(() => ({
  swedishCandidateFailure: false,
}))

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) => {
      if (
        namespace === 'admin.aiConnections' &&
        key === 'actionFailed' &&
        typeof values?.action === 'string' &&
        typeof values?.error === 'string'
      ) {
        return `Åtgärden "${values.action}" misslyckades. Fel: ${values.error}`
      }
      if (
        translationState.swedishCandidateFailure &&
        namespace === 'admin.aiConnections' &&
        key === 'profile.candidateBlockers'
      ) {
        return 'Profilrevisionen kunde inte aktiveras'
      }
      if (
        namespace === 'admin.aiConnections' &&
        (key === 'catalog.inputPrice' || key === 'catalog.outputPrice')
      ) {
        const direction = key === 'catalog.inputPrice' ? 'in' : 'ut'
        return `${direction} ${String(values?.amount)} ${String(values?.currency)}/1 mn token`
      }
      if (
        namespace === 'admin.aiConnections' &&
        key === 'model.verificationFailureReason'
      ) {
        return `Orsak: ${String(values?.reason)}`
      }
      if (
        namespace === 'admin.aiConnections' &&
        key === 'model.verificationFailedCapabilities'
      ) {
        return `Deklarerade förmågor som inte kunde verifieras: ${String(values?.capabilities)}.`
      }
      if (
        namespace === 'admin.aiConnections' &&
        key === 'model.capabilityCheckUnknownReason'
      ) {
        return `${String(values?.capability)} är fortfarande okänd. Orsak: ${String(values?.reason)}`
      }
      if (namespace === 'admin.aiConnections') {
        const referenceCopy: Record<string, string> = {
          'blockers.attestation_draft_pending':
            'Ett attestutkast är sparat men inte godkänt. Granska och komplettera de obligatoriska uppgifterna vid behov och godkänn sedan attesten.',
          'blockers.attestation_invalid':
            'Anslutningen har ingen godkänd och aktuell attest. Granska attestuppgifterna och ersätt eller uppdatera attesten.',
          'blockers.attestation_missing':
            'Ingen anslutningsattest har sparats. Fyll i och spara ett attestutkast innan det kan godkännas.',
          'blockers.data_policy_missing':
            'Driftsättningen saknar en datapolicy för anropstypen.',
          'attestation.banner.approvedChanged':
            'Den sparade attesten är godkänd, men formuläret innehåller ändringar som ännu inte är sparade eller godkända.',
          'attestation.banner.draft':
            'Attesten är sparad som utkast och är inte godkänd.',
          'attestation.banner.missing': 'Ingen attest har sparats.',
          'attestation.banner.replacementDraft':
            'Ett nytt attestutkast väntar på godkännande. Den tidigare godkända attesten gäller tills utkastet godkänns.',
          'attestation.banner.unsavedChanges':
            'Formuläret innehåller ändringar som ännu inte är sparade eller godkända.',
          'attestation.banner.valid': 'Attesten är godkänd och aktuell.',
          'fields.incidentResponseReference.help':
            'Hämta UUID-referensen för den godkända incidenthanteringsprocessen från organisationens styrningssystem. Skapa inte ett nytt UUID här. Kontakta informationssäkerhetsansvarig om du saknar referensen.',
          'fields.responsibleOrganizationUnitReference.help':
            'Hämta UUID-referensen för den ansvariga organisationsenheten från organisationens styrningssystem. Skapa inte ett nytt UUID här. Kontakta informationssäkerhets- eller AI-styrningsansvarig om du saknar referensen.',
        }
        if (referenceCopy[key]) return referenceCopy[key]
      }
      return `${namespace}.${key}`
    },
}))

beforeEach(() => {
  translationState.swedishCandidateFailure = false
})

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
    adapterAvailability: { available: true },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: name,
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: null,
    attestationDraft: null,
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
    revisionToken: `${id}-token`,
    tlsPolicyKey: 'controlled_test',
  } as AiAdminConnectionDetail
}

const connectionOne = detail(
  '10000000-0000-4000-8000-000000000001',
  'Controlled one',
)
const connectionTwo = detail(
  '10000000-0000-4000-8000-000000000002',
  'Controlled two',
)

function withVerifiedLatestModel(
  connection: AiAdminConnectionDetail,
): AiAdminConnectionDetail {
  return {
    ...connection,
    models: connection.models.map(model => ({
      ...model,
      revisions: model.revisions.map(revision => ({
        ...revision,
        status: 'verified' as const,
        verifiedCapabilities: capabilities,
      })),
    })),
  }
}

function withActiveVerifiedLatestModel(
  connection: AiAdminConnectionDetail,
): AiAdminConnectionDetail {
  return {
    ...withVerifiedLatestModel(connection),
    lifecycleStatus: 'active',
  }
}

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
            publicName: connectionOne.publicName,
            revisionToken: connectionOne.revisionToken,
          },
          {
            administrationName: connectionTwo.administrationName,
            configurationVersion: 1,
            id: connectionTwo.id,
            lifecycleStatus: 'draft',
            operationalHealth: 'unknown',
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
    for (const badge of screen.getAllByText(
      /admin\.aiConnections\.(?:health|lifecycle)\./,
    )) {
      expect(badge.closest('[role="status"]')).toBeNull()
    }

    const firstRegion = container.querySelector(
      `#ai-connection-${connectionOne.id}`,
    )
    const secondRegion = container.querySelector(
      `#ai-connection-${connectionTwo.id}`,
    )
    expect(first).toHaveAttribute('aria-controls', firstRegion?.id)
    expect(second).toHaveAttribute('aria-controls', secondRegion?.id)
    expect(firstRegion).toHaveAttribute('data-state', 'closed')
    expect(firstRegion).toHaveAttribute('aria-hidden', 'true')
    expect(secondRegion).toHaveAttribute('data-state', 'closed')

    fireEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(firstRegion).toHaveAttribute('data-state', 'open')
    expect(firstRegion).toHaveClass('motion-reduce:transition-none')

    fireEvent.click(second)
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(firstRegion).toHaveAttribute('data-state', 'closed')
    expect(screen.queryByText('Controlled one demo template')).not.toBeVisible()
  })

  it('distinguishes a missing attestation from a saved draft awaiting approval', async () => {
    const user = userEvent.setup()
    const draft = {
      decisionReference: null,
      id: '10000000-0000-4000-8000-000000000020',
      incidentResponseReference: null,
      isPersonalDataProcessed: null,
      isTrainingAllowed: null,
      maximumInformationClass: null,
      maximumRetentionDays: null,
      processingRegions: null,
      providerName: null,
      purpose: null,
      responsibleOrganizationUnitReference: null,
      reviewDueAt: null,
      reviewedAt: null,
      revisionNumber: 1,
      revisionToken: '10000000-0000-4000-8000-000000000021',
      status: 'draft' as const,
      subprocessors: null,
    }
    const connectionWithDraft = {
      ...connectionTwo,
      attestation: draft,
      attestationDraft: draft,
    }
    const defaultFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input) === `/api/admin/ai-connections/${connectionTwo.id}`
        ? Promise.resolve(okJson(connectionWithDraft))
        : defaultFetch?.(input),
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    expect(
      screen.getByText(
        'Ingen anslutningsattest har sparats. Fyll i och spara ett attestutkast innan det kan godkännas.',
      ),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Controlled two/ }))
    expect(
      screen.getByText(
        'Ett attestutkast är sparat men inte godkänt. Granska och komplettera de obligatoriska uppgifterna vid behov och godkänn sedan attesten.',
      ),
    ).toBeVisible()
  })

  it('keeps administration available and disables adapter operations when the adapter is not registered', async () => {
    const user = userEvent.setup()
    const unavailable = {
      ...withVerifiedLatestModel(
        detail('10000000-0000-4000-8000-000000000003', 'Local vLLM'),
      ),
      adapterAvailability: {
        available: false,
        reason: 'adapter_not_registered',
      },
      adapterKey: 'vllm',
    } satisfies AiAdminConnectionDetail
    const unavailableProfile = {
      ...profile,
      draftRevision: {
        ...profile.draftRevision,
        modelRevisionId: unavailable.models[0].revisions[0].id,
      },
    }
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/ai-connections') {
        return Promise.resolve(
          okJson([
            {
              administrationName: unavailable.administrationName,
              configurationVersion: unavailable.configurationVersion,
              id: unavailable.id,
              lifecycleStatus: unavailable.lifecycleStatus,
              operationalHealth: unavailable.operationalHealth,
              publicName: unavailable.publicName,
              revisionToken: unavailable.revisionToken,
            },
          ]),
        )
      }
      if (url === `/api/admin/ai-connections/${unavailable.id}`) {
        return Promise.resolve(okJson(unavailable))
      }
      if (url === '/api/admin/ai-run-profiles') {
        return Promise.resolve(okJson([unavailableProfile]))
      }
      if (url.includes('/api/admin/ai-run-profiles/')) {
        return Promise.resolve(okJson([unavailableProfile.draftRevision]))
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`))
    })
    const { container } = renderPanel()

    await user.click(await screen.findByRole('button', { name: /Local vLLM/ }))
    const regionElement = container.querySelector(
      `#ai-connection-${unavailable.id}`,
    )
    if (!(regionElement instanceof HTMLElement)) {
      throw new Error('Expanded connection region missing')
    }
    const region = within(regionElement)
    expect(
      region.getByText('admin.aiConnections.adapter.unavailable'),
    ).toBeVisible()
    for (const action of [
      'editConnection',
      'manageSecret',
      'manageAttestation',
    ]) {
      expect(
        region.getByRole('button', {
          name: `admin.aiConnections.actions.${action}`,
        }),
      ).toBeEnabled()
    }
    for (const action of [
      'fetchCatalog',
      'verifyConnection',
      'verifyModel',
      'probeHealth',
      'activateConnection',
    ]) {
      const button = region.getByRole('button', {
        name: `admin.aiConnections.actions.${action}`,
      })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute(
        'title',
        'admin.aiConnections.adapter.unavailableAction',
      )
    }
    const activateProfileButton = screen.getByRole('button', {
      name: 'admin.aiConnections.actions.activateProfile',
    })
    expect(activateProfileButton).toBeDisabled()
    expect(activateProfileButton).toHaveAttribute(
      'title',
      'admin.aiConnections.adapter.unavailableAction',
    )
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

  it('shows every action and its server-provided safe error in a floating alert', async () => {
    const user = userEvent.setup()
    const registryFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input) ===
            `/api/admin/ai-connections/${connectionOne.id}/actions` &&
          init?.method === 'POST'
        ) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: 'The AI connection trust policy blocked the request.',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 500,
              },
            ),
          )
        }
        return registryFetch?.(input, init)
      },
    )
    const { container } = renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    )

    let alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Åtgärden "admin.aiConnections.actions.fetchCatalog" misslyckades. Fel: The AI connection trust policy blocked the request.',
    )
    expect(alert).not.toHaveTextContent('Failed to perform AI connection')
    expect(alert.parentElement).toHaveClass('fixed')
    expect(
      container.querySelector(
        '[data-developer-mode-name="AI connection error feedback"]',
      ),
    ).toHaveAttribute('data-developer-mode-context', 'AI connection registry')

    await user.click(screen.getByRole('button', { name: 'common.close' }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.verifyConnection',
      }),
    )
    alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Åtgärden "admin.aiConnections.actions.verifyConnection" misslyckades. Fel: The AI connection trust policy blocked the request.',
    )
  })

  it('shows the bounded load error when a connection detail cannot load', async () => {
    const registryFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === `/api/admin/ai-connections/${connectionOne.id}`) {
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return registryFetch?.(input)
    })

    renderPanel()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.aiConnections.loadError',
    )
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
  catalog?: unknown[]
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
        if (body.action === 'fetch_catalog') {
          return Promise.resolve(okJson(options?.catalog ?? []))
        }
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
    const verifiedConnection = withVerifiedLatestModel(connectionOne)
    installWorkflowFetch({
      connection: verifiedConnection,
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
    expect(
      await within(dialog).findByText(
        'admin.aiConnections.catalog.unavailableManual',
      ),
    ).toBeVisible()
    expect(
      within(dialog).queryByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    ).not.toBeInTheDocument()
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

  it('locks unsupported profile capabilities when the selected verified model changes', async () => {
    const user = userEvent.setup()
    const verifiedConnection = withVerifiedLatestModel(connectionOne)
    const supportedModel = verifiedConnection.models[0]
    const limitedRevision = {
      ...supportedModel.revisions[0],
      id: '63000000-0000-4000-8000-000000000001',
      verifiedCapabilities: {
        ...capabilities,
        aiAnalysis: false,
        cost: false,
        jsonSchemaSteering: false,
        tokenUsage: false,
      },
    }
    const connectionWithLimitedModel = {
      ...verifiedConnection,
      models: [
        supportedModel,
        {
          ...supportedModel,
          id: '63000000-0000-4000-8000-000000000002',
          name: 'Limited model',
          revisions: [limitedRevision],
        },
      ],
    }
    installWorkflowFetch({
      connection: connectionWithLimitedModel,
      profiles: [profile],
      revisions: [profile.draftRevision],
    })
    renderPanel()

    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.editProfile',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    const aiAnalysis = within(dialog).getByLabelText(
      'admin.aiConnections.policy.aiAnalysis.label',
      { selector: 'select' },
    )
    expect(aiAnalysis).toBeEnabled()
    expect(aiAnalysis).toHaveValue('allowed')

    await user.selectOptions(
      field(dialog, 'modelRevisionId', 'select'),
      limitedRevision.id,
    )

    for (const capability of ['aiAnalysis', 'jsonSchema', 'usageMetadata']) {
      const input = within(dialog).getByLabelText(
        `admin.aiConnections.policy.${capability}.label`,
        { selector: 'select' },
      )
      expect(input).toHaveValue('disabled')
      expect(input).toBeDisabled()
    }
    expect(
      within(dialog).getAllByText(
        'admin.aiConnections.profile.unsupportedCapability',
      ),
    ).toHaveLength(3)
    expect(aiAnalysis.closest('fieldset')).toHaveAttribute(
      'data-developer-mode-name',
      'Verified model capability policy',
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
      return value.modelRevisionId === limitedRevision.id
    })
    expect(JSON.parse(String(profileRequest?.[1]?.body))).toMatchObject({
      capabilityPolicy: {
        aiAnalysis: 'disabled',
        jsonSchema: 'disabled',
        usageMetadata: 'disabled',
      },
      modelRevisionId: limitedRevision.id,
    })
  })

  it('prevents selecting a verified model that lacks a required profile capability', async () => {
    const user = userEvent.setup()
    const verifiedConnection = withVerifiedLatestModel(connectionOne)
    const imageProfile = {
      ...profile,
      draftRevision: { ...profile.draftRevision, modelRevisionId: null },
      profileKey: 'generation_with_images' as const,
    }
    installWorkflowFetch({
      connection: verifiedConnection,
      profiles: [imageProfile],
      revisions: [imageProfile.draftRevision],
    })
    renderPanel()

    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.editProfile',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    const modelSelect = field(
      dialog,
      'modelRevisionId',
      'select',
    ) as HTMLSelectElement
    const modelOption = Array.from(modelSelect.options).find(
      option => option.value === verifiedConnection.models[0].revisions[0].id,
    )

    expect(modelOption).toBeDisabled()
    expect(modelOption).toHaveTextContent(
      'admin.aiConnections.profile.incompatibleModel',
    )
    expect(
      within(dialog).getByText(
        'admin.aiConnections.profile.selectModelForCapabilities',
      ),
    ).toBeVisible()
  })

  it('shows effective run-profile status instead of treating enabled as active', async () => {
    const activeRevision = {
      ...profile.draftRevision,
      id: '64000000-0000-4000-8000-000000000003',
      revisionNumber: 2,
      status: 'active' as const,
    }
    const profiles = [
      profile,
      {
        ...profile,
        activeRevisionId: activeRevision.id,
        blockers: [{ code: 'connection_inactive' as const, field: undefined }],
        id: '64000000-0000-4000-8000-000000000001',
        profileKey: 'generation_with_images' as const,
      },
      {
        ...profile,
        activeRevisionId: activeRevision.id,
        id: '64000000-0000-4000-8000-000000000002',
        profileKey: 'invalid_json_repair' as const,
      },
    ]
    installWorkflowFetch({ profiles, revisions: [activeRevision] })
    renderPanel()

    await screen.findByRole('button', { name: /Controlled one/ })
    const statusByProfile = [
      ['generation_without_images', 'notActivated'],
      ['generation_with_images', 'blocked'],
      ['invalid_json_repair', 'active'],
    ] as const
    for (const [profileKey, status] of statusByProfile) {
      const card = screen
        .getByRole('heading', {
          name: `admin.aiConnections.profiles.${profileKey}`,
        })
        .closest('article')
      expect(card).not.toBeNull()
      expect(
        within(card as HTMLElement).getByText(
          `admin.aiConnections.profile.effectiveStatus.${status}`,
        ),
      ).toBeVisible()
    }
    expect(
      screen.queryByText('admin.aiConnections.profile.operational.enabled'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('admin.aiConnections.profile.revisionMetadata.draft'),
    ).toBeVisible()
    expect(
      screen.getAllByText(
        'admin.aiConnections.profile.revisionMetadata.activeAndDraft',
      ),
    ).toHaveLength(2)
    expect(
      screen.queryByText('admin.aiConnections.profile.noActiveRevision'),
    ).not.toBeInTheDocument()
  })

  it('offers only the latest verified revision for each connection model in a run profile', async () => {
    const user = userEvent.setup()
    const original = connectionOne.models[0].revisions[0]
    const olderVerified = {
      ...original,
      id: '61000000-0000-4000-8000-000000000001',
      revisionNumber: 1,
      status: 'verified' as const,
      verifiedCapabilities: capabilities,
    }
    const newerUnverified = {
      ...original,
      id: '61000000-0000-4000-8000-000000000002',
      revisionNumber: 2,
      status: 'verification_required' as const,
      verifiedCapabilities: null,
    }
    const latestVerified = {
      ...original,
      id: '62000000-0000-4000-8000-000000000002',
      revisionNumber: 2,
      status: 'verified' as const,
      verifiedCapabilities: capabilities,
    }
    const selectableConnection = {
      ...connectionOne,
      models: [
        {
          ...connectionOne.models[0],
          name: 'Model with pending latest revision',
          revisions: [newerUnverified, olderVerified],
        },
        {
          ...connectionOne.models[0],
          id: '62000000-0000-4000-8000-000000000000',
          name: 'Ready latest model',
          revisions: [
            {
              ...original,
              id: '62000000-0000-4000-8000-000000000001',
              revisionNumber: 1,
              status: 'verified' as const,
              verifiedCapabilities: capabilities,
            },
            latestVerified,
          ],
        },
      ],
    }
    installWorkflowFetch({
      connection: selectableConnection,
      profiles: [
        {
          ...profile,
          draftRevision: { ...profile.draftRevision, modelRevisionId: null },
        },
      ],
      revisions: [{ ...profile.draftRevision, modelRevisionId: null }],
    })
    renderPanel()

    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.editProfile',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    const select = field(
      dialog,
      'modelRevisionId',
      'select',
    ) as HTMLSelectElement
    const optionValues = Array.from(select.options, option => option.value)

    expect(optionValues).toEqual(['', latestVerified.id])
    expect(optionValues).not.toContain(olderVerified.id)
    expect(optionValues).not.toContain(newerUnverified.id)
    expect(select).toHaveTextContent('Ready latest model')
    expect(select).toHaveTextContent('admin.aiConnections.model.revision')
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

  it('disables profile activation while the selected connection is inactive', async () => {
    const inactiveConnection = {
      ...withVerifiedLatestModel(connectionOne),
      lifecycleStatus: 'suspended' as const,
    }
    installWorkflowFetch({
      connection: inactiveConnection,
      profiles: [profile],
      revisions: [profile.draftRevision],
    })
    renderPanel()

    const activate = await screen.findByRole('button', {
      name: 'admin.aiConnections.actions.activateProfile',
    })
    expect(activate).toBeDisabled()
    expect(activate).toHaveAttribute(
      'title',
      'admin.aiConnections.blockers.connection_inactive',
    )
  })

  it('renders candidate blockers returned when replacement activation is rejected', async () => {
    const user = userEvent.setup()
    installWorkflowFetch({
      connection: withActiveVerifiedLatestModel(connectionOne),
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
                code: 'validation',
                details: {
                  blockers: [
                    {
                      code: 'capability_policy_invalid',
                      field: 'validatableJson',
                    },
                  ],
                },
                error: 'Candidate is blocked',
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
      await screen.findByText('admin.aiConnections.profile.candidateBlockers', {
        selector: 'p',
      }),
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

    const profileArticle = screen
      .getByRole('heading', {
        name: 'admin.aiConnections.profiles.generation_without_images',
      })
      .closest('article')
    expect(profileArticle).not.toBeNull()
    await user.click(
      within(profileArticle as HTMLElement).getByRole('button', {
        name: 'admin.aiConnections.actions.editProfile',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.profile.saveDraft',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.queryByText('admin.aiConnections.profile.candidateBlockers'),
    ).not.toBeInTheDocument()
  })

  it('clears rejected candidate blockers after dependency verification and keeps the Swedish alert local', async () => {
    const user = userEvent.setup()
    translationState.swedishCandidateFailure = true
    const verifiedConnection = {
      ...withActiveVerifiedLatestModel(connectionOne),
      blockers: [],
    }
    installWorkflowFetch({
      connection: verifiedConnection,
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
                code: 'validation',
                details: {
                  blockers: [
                    {
                      code: 'data_policy_missing',
                    },
                  ],
                },
                error: 'AI configuration cannot be activated.',
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Profilrevisionen kunde inte aktiveras',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'AI configuration cannot be activated.',
    )
    expect(
      screen.getByText('Profilrevisionen kunde inte aktiveras', {
        selector: 'p',
      }),
    ).toBeVisible()
    expect(
      screen.getByText('Driftsättningen saknar en datapolicy för anropstypen.'),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Controlled one/ }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.verifyConnection',
      }),
    )

    await waitFor(() =>
      expect(
        screen.queryByText('Profilrevisionen kunde inte aktiveras', {
          selector: 'p',
        }),
      ).not.toBeInTheDocument(),
    )
  })

  it('fails closed when a candidate blocker payload has an unknown field', async () => {
    const user = userEvent.setup()
    installWorkflowFetch({
      connection: withActiveVerifiedLatestModel(connectionOne),
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
                code: 'validation',
                details: {
                  blockers: [
                    {
                      code: 'capability_policy_invalid',
                      field: 'providerSecret',
                    },
                  ],
                },
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.aiConnections.mutationError',
    )
    expect(
      screen.queryByText('admin.aiConnections.profile.candidateBlockers'),
    ).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(
      'admin.aiConnections.blockerFields.providerSecret',
    )
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

  it('selects a catalog model grouped by provider while retaining manual entry', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { action?: string }
          if (body.action === 'fetch_catalog') {
            return Promise.resolve(
              okJson([
                {
                  capabilities: {
                    ...capabilities,
                    imageInput: true,
                  },
                  externalModelId: 'anthropic/claude-catalog',
                  externalModelVersion: '2026-08-20',
                  inputPricePerMillionTokens: {
                    amount: '3',
                    currency: 'USD',
                  },
                  modelProviderName: 'anthropic',
                  name: 'Claude Catalog',
                  outputPricePerMillionTokens: {
                    amount: '15',
                    currency: 'USD',
                  },
                },
                {
                  capabilities,
                  externalModelId: 'mistralai/mistral-catalog',
                  externalModelVersion: null,
                  inputPricePerMillionTokens: null,
                  modelProviderName: 'mistralai',
                  name: 'Mistral Catalog',
                  outputPricePerMillionTokens: null,
                },
              ]),
            )
          }
          return Promise.resolve(okJson(connectionOne))
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
        name: 'admin.aiConnections.actions.addModel',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).queryByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    ).not.toBeInTheDocument()
    expect(field(dialog, 'externalModelId')).toBeEnabled()
    const catalogSelect = await within(dialog).findByLabelText(
      'admin.aiConnections.catalog.selectionLabel',
    )
    expect(
      within(dialog)
        .getByText('admin.aiConnections.catalog.selectionReady')
        .closest('[role="status"]'),
    ).toHaveAttribute(
      'data-developer-mode-name',
      'AI model catalog availability',
    )
    expect(
      catalogSelect.querySelector('optgroup[label="Anthropic"]'),
    ).not.toBeNull()
    expect(
      catalogSelect.querySelector('optgroup[label="Mistral"]'),
    ).not.toBeNull()
    expect(
      within(catalogSelect).getByRole('option', {
        name: 'admin.aiConnections.catalog.manualOption',
      }),
    ).toBeVisible()
    expect(
      within(catalogSelect).getByRole('option', {
        name: 'Mistral Catalog · mistralai/mistral-catalog',
      }),
    ).toBeVisible()

    await user.selectOptions(
      catalogSelect,
      within(catalogSelect).getByRole('option', {
        name: /Claude Catalog · anthropic\/claude-catalog · in 3 USD\/1 mn token · ut 15 USD\/1 mn token/,
      }),
    )
    expect(field(dialog, 'name')).toHaveValue('Claude Catalog')
    expect(field(dialog, 'externalModelId')).toHaveValue(
      'anthropic/claude-catalog',
    )
    expect(field(dialog, 'externalModelVersion')).toHaveValue('2026-08-20')
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'admin.aiConnections.capabilities.imageInput',
      }),
    ).toBeChecked()
    expect(
      screen.queryByText(/admin\.aiConnections\.catalog\.result/),
    ).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveModel',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.queryByText(/admin\.aiConnections\.catalog\.result/),
    ).not.toBeInTheDocument()
    const modelRequest = fetchMock.mock.calls.find(([, init]) =>
      String(init?.body).includes('save_model_revision'),
    )
    expect(JSON.parse(String(modelRequest?.[1]?.body))).toMatchObject({
      modelRevision: {
        declaredCapabilities: { imageInput: true },
        externalModelId: 'anthropic/claude-catalog',
        externalModelVersion: '2026-08-20',
        name: 'Claude Catalog',
      },
    })
    expect(
      (
        JSON.parse(String(modelRequest?.[1]?.body)) as {
          modelRevision: Record<string, unknown>
        }
      ).modelRevision,
    ).not.toHaveProperty('inputPricePerMillionTokens')
  })

  it('hides declared capabilities until the model catalog has loaded', async () => {
    const user = userEvent.setup()
    let resolveCatalog: ((response: Response) => void) | undefined
    const catalogResponse = new Promise<Response>(resolve => {
      resolveCatalog = resolve
    })
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { action?: string }
          if (body.action === 'fetch_catalog') return catalogResponse
          return Promise.resolve(okJson(connectionOne))
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
        name: 'admin.aiConnections.actions.editModel',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText(
        'admin.aiConnections.model.capabilitiesLoading',
      ),
    ).toBeVisible()
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0)
    expect(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saving',
      }),
    ).toBeDisabled()

    resolveCatalog?.(
      okJson([
        {
          capabilities,
          externalModelId: 'controlled/model',
          externalModelVersion: '1',
          inputPricePerMillionTokens: null,
          modelProviderName: 'controlled_test',
          name: 'Controlled catalog model',
          outputPricePerMillionTokens: null,
        },
      ]),
    )

    await within(dialog).findByText(
      'admin.aiConnections.catalog.selectionReady',
    )
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(7)
    expect(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveModel',
      }),
    ).toBeEnabled()
  })

  it('locks catalog claims and functionally checks only unknown model capabilities', async () => {
    const user = userEvent.setup()
    const catalogCapabilities = {
      ...capabilities,
      aiAnalysis: false,
      streaming: false,
      tokenUsage: false,
    }
    const capabilitySupport = Object.fromEntries(
      Object.keys(capabilities).map(capability => [
        capability,
        capability === 'aiAnalysis' || capability === 'tokenUsage'
          ? 'unknown'
          : catalogCapabilities[capability as keyof typeof capabilities]
            ? 'supported'
            : 'unsupported',
      ]),
    )
    const assessments = Object.fromEntries(
      Object.keys(capabilities).map(capability => [
        capability,
        {
          failureCategory:
            capability === 'tokenUsage' ? 'connection_unavailable' : null,
          support:
            capability === 'aiAnalysis'
              ? 'supported'
              : capability === 'tokenUsage'
                ? 'unknown'
                : 'unknown',
        },
      ]),
    )
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { action?: string }
          if (body.action === 'fetch_catalog') {
            return Promise.resolve(
              okJson([
                {
                  capabilities: catalogCapabilities,
                  capabilitySupport,
                  externalModelId: 'controlled/model',
                  externalModelVersion: '1',
                  inputPricePerMillionTokens: null,
                  modelProviderName: 'controlled_test',
                  name: 'Controlled catalog model',
                  outputPricePerMillionTokens: null,
                },
              ]),
            )
          }
          if (body.action === 'discover_model_capabilities') {
            expect(body).toMatchObject({
              capabilities: ['aiAnalysis', 'tokenUsage'],
              externalModelId: 'controlled/model',
              externalModelVersion: '1',
            })
            return Promise.resolve(
              okJson({
                assessments,
                capabilities: { ...catalogCapabilities, aiAnalysis: true },
              }),
            )
          }
          return Promise.resolve(okJson(connectionOne))
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
        name: 'admin.aiConnections.actions.editModel',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(
      'admin.aiConnections.catalog.selectionReady',
    )
    const streaming = within(dialog).getByRole('checkbox', {
      name: 'admin.aiConnections.capabilities.streaming',
    })
    const analysis = within(dialog).getByRole('checkbox', {
      name: 'admin.aiConnections.capabilities.aiAnalysis',
    })
    expect(streaming).not.toBeChecked()
    expect(streaming).toBeDisabled()
    expect(analysis).not.toBeChecked()
    expect(analysis).toBeDisabled()
    expect(streaming.closest('fieldset')).toHaveAttribute(
      'data-developer-mode-name',
      'AI model capability assessment',
    )

    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.checkCapabilities',
      }),
    )

    await waitFor(() =>
      expect(
        within(dialog).getByRole('checkbox', {
          name: 'admin.aiConnections.capabilities.aiAnalysis',
        }),
      ).toBeChecked(),
    )
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'admin.aiConnections.capabilities.aiAnalysis',
      }),
    ).toBeDisabled()
    expect(
      within(dialog).getAllByText(
        'admin.aiConnections.model.capabilitySupport.supported',
      ),
    ).not.toHaveLength(0)
    expect(
      await screen.findByText(
        'admin.aiConnections.model.capabilityCheckIncomplete',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        'admin.aiConnections.capabilities.tokenUsage är fortfarande okänd. Orsak: admin.aiConnections.model.verificationFailureCategories.connection_unavailable',
      ),
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.actions.saveModel',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const saved = fetchMock.mock.calls.find(([, init]) =>
      String(init?.body).includes('save_model_revision'),
    )
    expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({
      modelRevision: {
        declaredCapabilities: {
          aiAnalysis: true,
          streaming: false,
          tokenUsage: false,
        },
        discoveredCapabilities: null,
      },
    })
  })

  it('keeps a persisted capability assessment when the catalog remains unknown', async () => {
    const user = userEvent.setup()
    const persistedCapabilities = {
      ...capabilities,
      aiAnalysis: false,
    }
    const assessedConnection: AiAdminConnectionDetail = {
      ...connectionOne,
      models: [
        {
          ...connectionOne.models[0],
          revisions: [
            {
              ...connectionOne.models[0].revisions[0],
              declaredCapabilities: persistedCapabilities,
              discoveredCapabilities: persistedCapabilities,
            },
          ],
        },
      ],
    }
    installWorkflowFetch({
      catalog: [
        {
          capabilities: persistedCapabilities,
          capabilitySupport: {
            aiAnalysis: 'unknown',
            cost: 'supported',
            imageInput: 'unsupported',
            jsonSchemaSteering: 'supported',
            streaming: 'supported',
            tokenUsage: 'supported',
            validatableJson: 'supported',
          },
          externalModelId: 'controlled/model',
          externalModelVersion: '1',
          inputPricePerMillionTokens: null,
          modelProviderName: 'controlled_test',
          name: 'Controlled catalog model',
          outputPricePerMillionTokens: null,
        },
      ],
      connection: assessedConnection,
    })
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.editModel',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(
      'admin.aiConnections.catalog.selectionReady',
    )
    const analysis = within(dialog).getByRole('checkbox', {
      name: 'admin.aiConnections.capabilities.aiAnalysis',
    })
    const capabilityRow = analysis.closest('.min-h-11')
    expect(capabilityRow).not.toBeNull()
    expect(analysis).not.toBeChecked()
    expect(analysis).toBeDisabled()
    expect(
      within(capabilityRow as HTMLElement).getByText(
        'admin.aiConnections.model.capabilitySupport.unsupported',
      ),
    ).toBeVisible()
    expect(
      within(capabilityRow as HTMLElement).queryByText(
        'admin.aiConnections.model.capabilitySupport.unknown',
      ),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['missing result', null],
    [
      'non-boolean capability',
      {
        assessments: Object.fromEntries(
          Object.keys(capabilities).map(capability => [
            capability,
            { failureCategory: null, support: 'supported' },
          ]),
        ),
        capabilities: { ...capabilities, aiAnalysis: 'yes' },
      },
    ],
    [
      'missing assessment',
      { assessments: {}, capabilities: { ...capabilities } },
    ],
    [
      'unknown support value',
      {
        assessments: Object.fromEntries(
          Object.keys(capabilities).map(capability => [
            capability,
            {
              failureCategory: null,
              support: capability === 'aiAnalysis' ? 'maybe' : 'supported',
            },
          ]),
        ),
        capabilities: { ...capabilities },
      },
    ],
    [
      'non-string failure category',
      {
        assessments: Object.fromEntries(
          Object.keys(capabilities).map(capability => [
            capability,
            {
              failureCategory: capability === 'aiAnalysis' ? 42 : null,
              support: 'supported',
            },
          ]),
        ),
        capabilities: { ...capabilities },
      },
    ],
  ])(
    'rejects a malformed capability-discovery response: %s',
    async (_caseName, discoveryResponse) => {
      const user = userEvent.setup()
      const catalogCapabilities = { ...capabilities, aiAnalysis: false }
      fetchMock.mockImplementation(
        (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body)) as { action?: string }
            if (body.action === 'fetch_catalog') {
              return Promise.resolve(
                okJson([
                  {
                    capabilities: catalogCapabilities,
                    capabilitySupport: {
                      aiAnalysis: 'unknown',
                      cost: 'supported',
                      imageInput: 'unsupported',
                      jsonSchemaSteering: 'supported',
                      streaming: 'supported',
                      tokenUsage: 'supported',
                      validatableJson: 'supported',
                    },
                    externalModelId: 'controlled/model',
                    externalModelVersion: '1',
                    inputPricePerMillionTokens: null,
                    modelProviderName: 'controlled_test',
                    name: 'Controlled catalog model',
                    outputPricePerMillionTokens: null,
                  },
                ]),
              )
            }
            if (body.action === 'discover_model_capabilities') {
              return Promise.resolve(okJson(discoveryResponse))
            }
            return Promise.resolve(okJson(connectionOne))
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
          name: 'admin.aiConnections.actions.editModel',
        }),
      )
      const dialog = await screen.findByRole('dialog')
      await within(dialog).findByText(
        'admin.aiConnections.catalog.selectionReady',
      )
      await user.click(
        within(dialog).getByRole('button', {
          name: 'admin.aiConnections.actions.checkCapabilities',
        }),
      )
      expect(
        await screen.findByText(
          'admin.aiConnections.model.capabilityCheckInvalid',
        ),
      ).toBeVisible()
      expect(
        within(dialog).getByRole('checkbox', {
          name: 'admin.aiConnections.capabilities.aiAnalysis',
        }),
      ).not.toBeChecked()
    },
  )

  it('falls back to manual model fields without a global error when automatic catalog loading fails', async () => {
    const user = userEvent.setup()
    installWorkflowFetch()
    const successfulFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          init?.method === 'POST' &&
          String(init.body).includes('fetch_catalog')
        ) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Catalog is unavailable' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 503,
            }),
          )
        }
        return successfulFetch?.(input, init)
      },
    )
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

    expect(
      await within(dialog).findByText(
        'admin.aiConnections.catalog.unavailableManual',
      ),
    ).toBeVisible()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(field(dialog, 'name')).toBeEnabled()
    expect(field(dialog, 'externalModelId')).toBeEnabled()
    expect(
      within(dialog).queryByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    ).not.toBeInTheDocument()
  })

  it('keeps attestation save and approval as separate mutations', async () => {
    const user = userEvent.setup()
    const saved = {
      decisionReference: 'DEC-1',
      id: '60000000-0000-4000-8000-000000000001',
      incidentResponseReference: 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF',
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
      incidentResponseReference: saved.incidentResponseReference.toLowerCase(),
      maximumInformationClass: 'internal',
      maximumRetentionDays: '0',
      processingRegions: 'SE',
      providerName: 'Controlled provider',
      purpose: 'Controlled test',
      reviewDueAt: saved.reviewDueAt,
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
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input) === '/api/admin/ai-connections' &&
            (init?.method ?? 'GET') === 'GET',
        ),
      ).toHaveLength(2),
    )
    expect(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.attestation.saveDraft',
      }),
    ).toBeDisabled()
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
    expect(actionBodies[1].attestation.revisionToken).toBe(saved.revisionToken)
    expect(actionBodies[1].attestation).not.toHaveProperty('id')
    expect(actionBodies[1].attestation).not.toHaveProperty('status')
  }, 10_000)

  it('explains where administrators obtain external attestation references', async () => {
    const user = userEvent.setup()
    installWorkflowFetch()
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

    await user.click(
      within(dialog).getByRole('button', {
        name: 'common.help: admin.aiConnections.fields.responsibleOrganizationUnitReference.label',
      }),
    )
    expect(
      within(dialog).getByText(
        /ansvariga organisationsenheten från organisationens styrningssystem/,
      ),
    ).toBeVisible()

    await user.click(
      within(dialog).getByRole('button', {
        name: 'common.help: admin.aiConnections.fields.incidentResponseReference.label',
      }),
    )
    expect(
      within(dialog).getByText(
        /godkända incidenthanteringsprocessen från organisationens styrningssystem/,
      ),
    ).toBeVisible()
  })

  it('allows an existing persisted attestation draft to be approved', async () => {
    const user = userEvent.setup()
    const persistedDraft = {
      decisionReference: 'DEMO-DECISION-1',
      id: '61000000-0000-4000-8000-000000000001',
      incidentResponseReference: '61000000-0000-4000-8000-000000000002',
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'OpenRouter',
      purpose: 'AI-assisted authoring',
      responsibleOrganizationUnitReference:
        '61000000-0000-4000-8000-000000000003',
      reviewDueAt: '2099-01-01T00:00:00.000Z',
      reviewedAt: '2026-08-19T00:00:00.000Z',
      revisionNumber: 1,
      revisionToken: '61000000-0000-4000-8000-000000000004',
      status: 'draft' as const,
      subprocessors: [],
    }
    installWorkflowFetch({
      connection: { ...connectionOne, attestation: persistedDraft },
      mutation: body =>
        body.action === 'attest' ? { ...persistedDraft, status: 'valid' } : {},
    })
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    expect(
      screen.getByText(
        'Ett attestutkast är sparat men inte godkänt. Granska och komplettera de obligatoriska uppgifterna vid behov och godkänn sedan attesten.',
      ),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageAttestation',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'Attesten är sparad som utkast och är inte godkänd.',
      ),
    ).toBeVisible()
    const saveButton = within(dialog).getByRole('button', {
      name: 'admin.aiConnections.attestation.saveDraft',
    })
    expect(saveButton).toBeDisabled()
    const purpose = field(dialog, 'purpose', 'textarea')
    await user.clear(purpose)
    await user.type(purpose, 'Changed AI-assisted authoring')
    expect(saveButton).toBeEnabled()
    await user.clear(purpose)
    await user.type(purpose, persistedDraft.purpose)
    expect(saveButton).toBeDisabled()
    await user.click(
      within(dialog).getByRole('button', {
        name: 'admin.aiConnections.attestation.approve',
      }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const body = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)))
      .find(candidate => candidate.action === 'attest')
    expect(body).toMatchObject({
      action: 'attest',
      attestation: { revisionToken: persistedDraft.revisionToken },
      currentAttestationRevisionToken: null,
    })
  })

  it('keeps a saved valid attestation clean and distinguishes edited values', async () => {
    const user = userEvent.setup()
    const validAttestation = {
      decisionReference: 'APPROVED-1',
      id: '62000000-0000-4000-8000-000000000001',
      incidentResponseReference: '62000000-0000-4000-8000-000000000002',
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'OpenRouter',
      purpose: 'Approved AI-assisted authoring',
      responsibleOrganizationUnitReference:
        '62000000-0000-4000-8000-000000000003',
      reviewDueAt: '2099-01-01T00:00:00.000Z',
      reviewedAt: '2026-08-19T00:00:00.000Z',
      revisionNumber: 1,
      revisionToken: '62000000-0000-4000-8000-000000000004',
      status: 'valid' as const,
      subprocessors: [],
    }
    installWorkflowFetch({
      connection: { ...connectionOne, attestation: validAttestation },
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
    const saveButton = within(dialog).getByRole('button', {
      name: 'admin.aiConnections.attestation.saveDraft',
    })
    expect(saveButton).toBeDisabled()
    expect(
      within(dialog).getByText('Attesten är godkänd och aktuell.'),
    ).toBeVisible()
    expect(
      within(dialog)
        .getByText('Attesten är godkänd och aktuell.')
        .closest('[role="status"]'),
    ).toHaveAttribute(
      'data-developer-mode-name',
      'AI attestation approval status',
    )

    const purpose = field(dialog, 'purpose', 'textarea')
    await user.clear(purpose)
    await user.type(purpose, 'Edited AI-assisted authoring')

    expect(saveButton).toBeEnabled()
    expect(
      within(dialog).getByText(
        'Den sparade attesten är godkänd, men formuläret innehåller ändringar som ännu inte är sparade eller godkända.',
      ),
    ).toBeVisible()
  })

  it('reopens a replacement draft and keeps save, revert, and approval in one action row', async () => {
    const user = userEvent.setup()
    const validAttestation = {
      decisionReference: 'APPROVED-1',
      id: '63000000-0000-4000-8000-000000000001',
      incidentResponseReference: '63000000-0000-4000-8000-000000000002',
      isPersonalDataProcessed: false,
      isTrainingAllowed: false,
      maximumInformationClass: 'internal',
      maximumRetentionDays: 0,
      processingRegions: ['SE'],
      providerName: 'OpenRouter',
      purpose: 'Approved AI-assisted authoring',
      responsibleOrganizationUnitReference:
        '63000000-0000-4000-8000-000000000003',
      reviewDueAt: '2099-01-01T00:00:00.000Z',
      reviewedAt: '2026-08-19T00:00:00.000Z',
      revisionNumber: 1,
      revisionToken: '63000000-0000-4000-8000-000000000004',
      status: 'valid' as const,
      subprocessors: [],
    }
    const replacementDraft = {
      ...validAttestation,
      id: '63000000-0000-4000-8000-000000000005',
      incidentResponseReference: '63000000-0000-4000-8000-000000000006',
      revisionNumber: 2,
      revisionToken: '63000000-0000-4000-8000-000000000007',
      status: 'draft' as const,
    }
    installWorkflowFetch({
      connection: {
        ...connectionOne,
        attestation: validAttestation,
        attestationDraft: replacementDraft,
      },
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
    expect(field(dialog, 'incidentResponseReference')).toHaveValue(
      replacementDraft.incidentResponseReference,
    )
    expect(
      within(dialog).getByText(
        'Ett nytt attestutkast väntar på godkännande. Den tidigare godkända attesten gäller tills utkastet godkänns.',
      ),
    ).toBeVisible()

    const save = within(dialog).getByRole('button', {
      name: 'admin.aiConnections.attestation.saveDraft',
    })
    const revert = within(dialog).getByRole('button', {
      name: 'admin.aiConnections.attestation.discardDraft',
    })
    const approve = within(dialog).getByRole('button', {
      name: 'admin.aiConnections.attestation.approve',
    })
    expect(save).toBeDisabled()
    expect(revert.parentElement).toBe(save.parentElement)
    expect(approve.parentElement).toBe(save.parentElement)

    await user.click(revert)
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(
      within(confirmation).getByRole('button', {
        name: 'admin.aiConnections.attestation.discardDraft',
      }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'admin.aiConnections.dialogs.attestation',
        }),
      ).toBeNull(),
    )
    const body = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)))
      .find(candidate => candidate.action === 'discard_attestation_draft')
    expect(body).toEqual({
      action: 'discard_attestation_draft',
      currentAttestationRevisionToken: validAttestation.revisionToken,
      draftAttestationId: replacementDraft.id,
      draftAttestationRevisionToken: replacementDraft.revisionToken,
    })
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

  it('shows a bounded error when a profile mutation throws', async () => {
    const user = userEvent.setup()
    installWorkflowFetch({
      profiles: [profile],
      revisions: [profile.draftRevision],
    })
    const successfulFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? Promise.reject(new Error('provider secret must stay private'))
          : successfulFetch?.(input, init),
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', {
        name: 'admin.aiConnections.actions.suspendProfile',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.aiConnections.mutationError',
    )
    expect(document.body.textContent).not.toContain(
      'provider secret must stay private',
    )
  })

  it('shows model verification progress and reports a completed verification that did not pass', async () => {
    const user = userEvent.setup()
    const verifiableConnection = {
      ...connectionOne,
      connectionEvidenceId: '70000000-0000-4000-8000-000000000010',
    }
    installWorkflowFetch({ connection: verifiableConnection })
    const regularFetch = fetchMock.getMockImplementation()
    let resolveVerification: ((response: Response) => void) | undefined
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          init?.method === 'POST' &&
          String(init.body).includes('verify_model_revision')
        ) {
          return new Promise<Response>(resolve => {
            resolveVerification = resolve
          })
        }
        return regularFetch?.(input, init)
      },
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    const healthButton = screen.getByRole('button', {
      name: 'admin.aiConnections.actions.probeHealth',
    })
    expect(healthButton).toBeDisabled()
    expect(healthButton).toHaveClass(
      'disabled:cursor-not-allowed',
      'disabled:opacity-50',
    )
    expect(healthButton).toHaveAttribute(
      'title',
      'admin.aiConnections.health.verifyModelFirst',
    )
    expect(
      screen.getByText('admin.aiConnections.health.verifyModelFirst'),
    ).toBeVisible()
    expect(healthButton.closest('[data-developer-mode-name]')).toHaveAttribute(
      'data-developer-mode-name',
      'AI model verification and health actions',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.verifyModel',
      }),
    )
    const pendingButton = await screen.findByRole('button', {
      name: 'admin.aiConnections.actions.verifyingModel',
    })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        String(init?.body).includes('verify_model_revision'),
      ),
    ).toHaveLength(1)

    resolveVerification?.(
      okJson({
        revision: verifiableConnection.models[0].revisions[0],
        verification: {
          failedCapabilities: ['aiAnalysis'],
          failedChecks: [],
          failureCategory: 'capability_mismatch',
          outcome: 'failed',
          testSuiteVersion: 'ai-admin-functional-probe-v4',
        },
      }),
    )
    const warning = await screen.findByText(
      'admin.aiConnections.model.verificationFailed',
    )
    expect(warning.closest('[role="status"]')).toHaveClass('border-amber-200')
    expect(
      screen.getByText(
        'Orsak: admin.aiConnections.model.verificationFailureCategories.capability_mismatch',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Deklarerade förmågor som inte kunde verifieras: admin.aiConnections.capabilities.aiAnalysis.',
      ),
    ).toBeVisible()
    expect(warning.closest('[role="status"]')).toHaveTextContent(
      'admin.aiConnections.capabilities.aiAnalysis',
    )
    expect(healthButton).toBeDisabled()
  })

  it('reports a model verification that passes its exact revision contract', async () => {
    const user = userEvent.setup()
    const verifiableConnection = {
      ...connectionOne,
      connectionEvidenceId: '70000000-0000-4000-8000-000000000012',
    }
    installWorkflowFetch({ connection: verifiableConnection })
    const regularFetch = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' &&
        String(init.body).includes('verify_model_revision')
          ? Promise.resolve(
              okJson({
                revision: {
                  ...verifiableConnection.models[0].revisions[0],
                  status: 'verified',
                },
                verification: {
                  failedCapabilities: [],
                  failedChecks: [],
                  failureCategory: null,
                  outcome: 'passed',
                  testSuiteVersion: 'ai-admin-functional-probe-v4',
                },
              }),
            )
          : regularFetch?.(input, init),
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.verifyModel',
      }),
    )

    expect(
      await screen.findByText('admin.aiConnections.model.verified'),
    ).toBeVisible()
  })

  it('shows health-probe progress and reports the resulting health', async () => {
    const user = userEvent.setup()
    const verifiedConnection = {
      ...connectionOne,
      connectionEvidenceId: '70000000-0000-4000-8000-000000000011',
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
    installWorkflowFetch({ connection: verifiedConnection })
    const regularFetch = fetchMock.getMockImplementation()
    let resolveHealth: ((response: Response) => void) | undefined
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          init?.method === 'POST' &&
          String(init.body).includes('probe_health')
        ) {
          return new Promise<Response>(resolve => {
            resolveHealth = resolve
          })
        }
        return regularFetch?.(input, init)
      },
    )
    renderPanel()

    await user.click(
      await screen.findByRole('button', { name: /Controlled one/ }),
    )
    const verifyButton = screen.getByRole('button', {
      name: 'admin.aiConnections.actions.verifyModel',
    })
    expect(verifyButton).toBeDisabled()
    expect(verifyButton).toHaveClass(
      'disabled:cursor-not-allowed',
      'disabled:opacity-50',
    )
    expect(verifyButton).toHaveAttribute(
      'title',
      'admin.aiConnections.model.alreadyVerified',
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.probeHealth',
      }),
    )
    const pendingButton = await screen.findByRole('button', {
      name: 'admin.aiConnections.actions.probingHealth',
    })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')

    resolveHealth?.(okJson(verifiedConnection))
    expect(
      await screen.findByText('admin.aiConnections.health.probeResult.healthy'),
    ).toBeVisible()
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
      catalog: [
        {
          capabilities,
          externalModelId: 'controlled/model',
          externalModelVersion: '1',
          inputPricePerMillionTokens: null,
          modelProviderName: 'Controlled Test',
          name: 'Controlled model',
          outputPricePerMillionTokens: null,
        },
      ],
      connection: readyConnection,
      mutation: () => ({}),
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
    const retireConnectionButton = screen.getByRole('button', {
      name: 'admin.aiConnections.actions.retireConnection',
    })
    expect(retireConnectionButton).toHaveClass('btn-destructive')
    await user.click(retireConnectionButton)
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
