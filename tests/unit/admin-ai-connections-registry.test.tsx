import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiConnectionsRegistry from '@/app/[locale]/admin/panels/settings/ai-connections/ai-connections-registry'
import type {
  AiAdminConnectionDetail,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: { anchorEl?: HTMLElement }) => true),
  loadRegistry: vi.fn(async () => undefined),
  mutateAndReload: vi.fn(async () => true),
  mutation: vi.fn(async (_url: string, _body: unknown) => new Response('[]')),
  state: {} as Record<string, unknown>,
}))

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      `${namespace}.${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`,
}))
vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: mocks.confirm }),
}))
vi.mock('@/components/AutoDismissStatusToast', () => ({
  default: ({ message, onDismiss }: { message: string; onDismiss(): void }) => (
    <div>
      <p>{message}</p>
      <button onClick={onDismiss} type="button">
        toast-dismiss
      </button>
    </div>
  ),
}))
vi.mock('@/components/FormModal', () => ({
  default: ({
    children,
    onClose,
    open,
  }: {
    children: ReactNode
    onClose(): void
    open: boolean
  }) =>
    open ? (
      <div role="dialog">
        <button onClick={onClose} type="button">
          modal-close
        </button>
        {children}
      </div>
    ) : null,
}))
vi.mock(
  '@/app/[locale]/admin/panels/settings/ai-connections/use-registry-request-state',
  () => ({ useRegistryRequestState: () => mocks.state }),
)
vi.mock(
  '@/app/[locale]/admin/panels/settings/ai-connections/registry-sections',
  () => ({
    AnimatedRegistrySection: ({
      children,
      expanded,
      id,
    }: {
      children: ReactNode
      expanded: boolean
      id: string
    }) => (expanded ? <div id={id}>{children}</div> : null),
    attestationBlockerState: () => 'missing',
    BlockerText: ({ blocker }: { blocker: { code: string } }) => (
      <span>{blocker.code}</span>
    ),
    healthTone: () => 'success',
    lifecycleTone: () => 'success',
    revisionTone: () => 'success',
    StatusBadge: ({ children }: { children: ReactNode }) => (
      <span role="status">{children}</span>
    ),
  }),
)
vi.mock(
  '@/app/[locale]/admin/panels/settings/ai-connections/connection-forms',
  () => ({
    AttestationForm: ({
      onAttest,
      onCancel,
      onDiscard,
      onSave,
    }: {
      onAttest(value: unknown, token: null): void
      onCancel(): void
      onDiscard(value: unknown, token: null): void
      onSave(value: unknown): void
    }) => (
      <div>
        <button onClick={() => onSave({})} type="button">
          attestation-save
        </button>
        <button
          onClick={() =>
            onDiscard({ id: 'draft', revisionToken: 'token' }, null)
          }
          type="button"
        >
          attestation-discard
        </button>
        <button onClick={() => onAttest({}, null)} type="button">
          attestation-attest
        </button>
        <button onClick={onCancel} type="button">
          attestation-cancel
        </button>
      </div>
    ),
    ConnectionForm: ({
      onCancel,
      onSubmit,
    }: {
      onCancel(): void
      onSubmit(value: unknown): void
    }) => (
      <div>
        <button onClick={() => onSubmit({})} type="button">
          connection-submit
        </button>
        <button onClick={onCancel} type="button">
          connection-cancel
        </button>
      </div>
    ),
    SecretForm: ({
      onActivate,
      onCancel,
      onConfirmRevocation,
      onDelete,
      onWrite,
    }: {
      onActivate(id: string): void
      onCancel(): void
      onConfirmRevocation(id: string, anchor: HTMLElement): void
      onDelete(id: string): void
      onWrite(secret: string, form: { reset(): void }): void
    }) => (
      <div>
        <button
          onClick={() => onWrite('secret', { reset: vi.fn() })}
          type="button"
        >
          secret-write
        </button>
        <button onClick={() => onDelete('candidate')} type="button">
          secret-delete
        </button>
        <button
          onClick={event => onConfirmRevocation('active', event.currentTarget)}
          type="button"
        >
          secret-revoke
        </button>
        <button onClick={() => onActivate('candidate')} type="button">
          secret-activate
        </button>
        <button onClick={onCancel} type="button">
          secret-cancel
        </button>
      </div>
    ),
  }),
)
vi.mock(
  '@/app/[locale]/admin/panels/settings/ai-connections/model-profile-forms',
  () => ({
    ModelForm: ({
      onCancel,
      onComplete,
      onRefreshCatalog,
      onRegisterClose,
    }: {
      onCancel(): void
      onComplete(): void
      onRefreshCatalog?(): void
      onRegisterClose?(handler: () => void): void
    }) => (
      <div>
        <button
          onClick={() => onRegisterClose?.(() => onCancel())}
          type="button"
        >
          register-model-close
        </button>
        <button onClick={onComplete} type="button">
          model-complete
        </button>
        <button onClick={onRefreshCatalog} type="button">
          model-refresh
        </button>
      </div>
    ),
    ProfileForm: ({
      onCancel,
      onComplete,
    }: {
      onCancel(): void
      onComplete(): void
    }) => (
      <div>
        <button onClick={onComplete} type="button">
          profile-complete
        </button>
        <button onClick={onCancel} type="button">
          profile-cancel
        </button>
      </div>
    ),
  }),
)
vi.mock('@/lib/developer-mode-markers', () => ({
  devMarker: () => ({ 'data-developer-mode': 'ai-connections-registry' }),
}))

function fixtures(): {
  connection: AiAdminConnectionDetail
  profile: AiAdminRunProfileRecord
} {
  const verified = {
    reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
    agentRuntimeVersion: null,
    connectionConfigurationVersion: 1,
    declaredCapabilities: {} as never,
    discoveredCapabilities: null,
    externalModelId: 'controlled/model',
    externalModelVersion: null,
    id: '00000000-0000-4000-8000-000000000004',
    profileCompatibility: null,
    revisionNumber: 1,
    revisionToken: '00000000-0000-4000-8000-000000000005',
    status: 'verified' as const,
    testSuiteVersion: 'v5',
    verifiedAt: '2026-08-22T00:00:00.000Z',
    verifiedCapabilities: {} as never,
  }
  const connection: AiAdminConnectionDetail = {
    activeSecret: { available: false, reason: 'secret_missing' },
    adapterAvailability: { available: true },
    adapterKey: 'controlled_test',
    adapterVersion: '1',
    administrationName: 'Admin connection',
    agentRuntimeKey: null,
    agentRuntimeVersion: null,
    attestation: null,
    attestationDraft: null,
    authenticationType: 'none',
    blockers: [{ code: 'attestation_invalid' }],
    configurationVersion: 1,
    connectionEvidenceId: null,
    dataPolicySummary: 'Synthetic',
    description: null,
    egressPolicyKey: 'controlled',
    endpointUrl: 'https://controlled.invalid',
    id: '00000000-0000-4000-8000-000000000001',
    lifecycleStatus: 'active',
    maximumConcurrency: 1,
    models: [
      {
        description: null,
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Model',
        revisionToken: '00000000-0000-4000-8000-000000000003',
        revisions: [
          verified,
          {
            ...verified,
            id: '00000000-0000-4000-8000-000000000006',
            revisionNumber: 2,
            revisionToken: '00000000-0000-4000-8000-000000000007',
            status: 'ended',
          },
        ],
      },
    ],
    operationalHealth: 'healthy',
    publicName: 'Public connection',
    revisionToken: '00000000-0000-4000-8000-000000000008',
    tlsPolicyKey: 'controlled',
  }
  return {
    connection,
    profile: {
      administrativeStatus: 'blocked',
      blockers: [{ code: 'model_revision_unverified' }],
      configurationStatus: 'blocked',
      configurationVersion: 1,
      id: '00000000-0000-4000-8000-000000000009',
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 16,
      maximumOutputBytes: 65_536,
      maximumOutputTokens: 1_536,
      maximumRetainedMemoryBytes: 131_072,
      modelRevisionId: verified.id,
      operationalStatus: 'enabled',
      profileKey: 'generation_without_images',
      queueCapacity: 1,
      revisionToken: '00000000-0000-4000-8000-000000000010',
      totalTimeBudgetSeconds: 300,
    },
  }
}

describe('AI connections registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockResolvedValue(true)
    const { connection, profile } = fixtures()
    Object.assign(mocks.state, {
      busy: false,
      candidateBlockers: {},
      clearError: vi.fn(),
      connections: [connection],
      details: { [connection.id]: connection },
      error: null,
      loading: false,
      loadRegistry: mocks.loadRegistry,
      message: null,
      messageDetails: [],
      messageTone: 'success',
      mutateAndReload: mocks.mutateAndReload,
      mutation: mocks.mutation,
      profiles: [profile],
      setCandidateBlockers: vi.fn(),
      setError: vi.fn(),
      setMessage: vi.fn(),
    })
    mocks.mutation.mockImplementation(
      async (_url, body) =>
        new Response(
          JSON.stringify(
            (body as { action?: string }).action === 'fetch_catalog'
              ? [
                  {
                    externalModelId: 'catalog/model',
                    externalModelVersion: null,
                    name: 'Catalog model',
                  },
                ]
              : (body as { action?: string }).action === 'probe_health'
                ? { operationalHealth: 'healthy' }
                : {},
          ),
        ),
    )
  })

  it('marks the surface, loads the catalog, and probes model health', async () => {
    const user = userEvent.setup()
    const { container } = render(<AiConnectionsRegistry />)
    expect(
      container.querySelector(
        '[data-developer-mode="ai-connections-registry"]',
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: /Admin connection/,
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    )
    expect(await screen.findByText(/Catalog model/)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.probeHealth',
      }),
    )
    expect(mocks.mutation).toHaveBeenLastCalledWith(
      '/api/admin/ai-connections/00000000-0000-4000-8000-000000000001/actions',
      {
        action: 'probe_health',
        modelRevisionId: '00000000-0000-4000-8000-000000000004',
        revisionToken: '00000000-0000-4000-8000-000000000005',
      },
      { actionLabel: 'admin.aiConnections.actions.probeHealth' },
    )
    expect(mocks.state.setMessage).toHaveBeenCalledWith(
      'admin.aiConnections.health.probeResult.healthy',
      'success',
    )
  })

  it('reports malformed catalog responses through registry error state', async () => {
    mocks.mutation.mockResolvedValueOnce(new Response('{'))
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)
    await user.click(screen.getByRole('button', { name: /Admin connection/ }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    )

    expect(mocks.state.setError).toHaveBeenCalledWith({
      kind: 'mutation',
      message:
        'admin.aiConnections.actionFailed admin.aiConnections.actions.fetchCatalog admin.aiConnections.mutationError',
    })
  })

  it('sends exact destructive model-revision actions after confirmation', async () => {
    mocks.state.profiles = []
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)
    await user.click(screen.getByRole('button', { name: /Admin connection/ }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.destructive.end.confirm',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.destructive.delete.confirm',
      }),
    )
    expect(mocks.confirm).toHaveBeenCalledTimes(2)
    expect(mocks.confirm.mock.calls[0]?.[0].anchorEl).toBeInstanceOf(
      HTMLElement,
    )
    expect(mocks.mutateAndReload).toHaveBeenNthCalledWith(
      1,
      '/api/admin/ai-connections/00000000-0000-4000-8000-000000000001/actions',
      {
        action: 'end_model_revision',
        modelRevisionId: '00000000-0000-4000-8000-000000000004',
        revisionToken: '00000000-0000-4000-8000-000000000005',
      },
      'messages.revisionEnded',
      {
        actionLabel: 'admin.aiConnections.destructive.end.confirm',
      },
    )
    expect(mocks.mutateAndReload).toHaveBeenNthCalledWith(
      2,
      '/api/admin/ai-connections/00000000-0000-4000-8000-000000000001/actions',
      {
        action: 'delete_model_revision',
        modelRevisionId: '00000000-0000-4000-8000-000000000006',
        revisionToken: '00000000-0000-4000-8000-000000000007',
      },
      'messages.revisionDeleted',
      {
        actionLabel: 'admin.aiConnections.destructive.delete.confirm',
      },
    )
  })

  it('routes connection lifecycle and profile status actions', async () => {
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)
    await user.click(screen.getByRole('button', { name: /Admin connection/ }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.suspendConnection',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.retireConnection',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.directProfile.pause',
      }),
    )
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'admin.aiConnections.directProfile.pauseConfirm.message',
        title: 'admin.aiConnections.directProfile.pauseConfirm.title',
      }),
    )
    expect(mocks.mutateAndReload).toHaveBeenCalledWith(
      '/api/admin/ai-connections/00000000-0000-4000-8000-000000000001/actions',
      expect.objectContaining({
        action: 'set_lifecycle',
        status: 'suspended',
      }),
      'lifecycle.suspendedMessage',
      expect.any(Object),
    )
    expect(mocks.mutateAndReload).toHaveBeenCalledWith(
      '/api/admin/ai-run-profiles/generation_without_images/actions',
      expect.objectContaining({ action: 'set_operational_status' }),
      'profile.suspended',
      expect.any(Object),
    )
  })

  it('does not pause a profile when the run-cancellation warning is rejected', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.directProfile.pause',
      }),
    )

    expect(mocks.mutateAndReload).not.toHaveBeenCalled()
  })

  it('offers only editing for an unconfigured profile', () => {
    const { connection, profile } = fixtures()
    Object.assign(profile, {
      administrativeStatus: 'unconfigured',
      blockers: [{ code: 'model_revision_missing' }],
      configurationStatus: 'unconfigured',
      modelRevisionId: null,
      operationalStatus: 'enabled',
    } satisfies Partial<AiAdminRunProfileRecord>)
    Object.assign(mocks.state, {
      connections: [connection],
      details: { [connection.id]: connection },
      profiles: [profile],
    })

    render(<AiConnectionsRegistry />)

    expect(
      screen.getByText('admin.aiConnections.directProfile.status.unconfigured'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'admin.aiConnections.directProfile.statusHelp.unconfigured',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.directProfile.edit',
      }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', {
        name: 'admin.aiConnections.directProfile.pause',
      }),
    ).not.toBeInTheDocument()
  })

  it('wires connection, secret, attestation, model, and profile dialogs', async () => {
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)
    await user.click(screen.getByRole('button', { name: /Admin connection/ }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addConnection',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'connection-submit' }))

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.editConnection',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'connection-submit' }))

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageSecret',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'secret-write' }))
    await user.click(screen.getByRole('button', { name: 'secret-delete' }))
    await user.click(screen.getByRole('button', { name: 'secret-activate' }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageSecret',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'secret-revoke' }))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(2))

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageAttestation',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'attestation-save' }))
    await user.click(
      screen.getByRole('button', { name: 'attestation-discard' }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageAttestation',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'attestation-attest' }))

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addModel',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'model-refresh' }))
    await user.click(screen.getByRole('button', { name: 'model-complete' }))
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.editModel',
      }),
    )
    await user.click(
      screen.getByRole('button', { name: 'register-model-close' }),
    )
    await user.click(screen.getByRole('button', { name: 'modal-close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.directProfile.edit',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'profile-complete' }))
  })

  it('disables registry actions and dialog entry points while mutating', async () => {
    mocks.state.busy = true
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)
    expect(screen.getByText('common.saving')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addConnection',
      }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Admin connection/ }))
    for (const name of [
      'admin.aiConnections.actions.editConnection',
      'admin.aiConnections.actions.manageSecret',
      'admin.aiConnections.actions.manageAttestation',
      'admin.aiConnections.actions.addModel',
      'admin.aiConnections.actions.editModel',
      'admin.aiConnections.directProfile.edit',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('renders request feedback and exposes the matching recovery action', async () => {
    const user = userEvent.setup()
    Object.assign(mocks.state, {
      connections: [],
      details: {},
      error: { kind: 'load', message: 'load failed' },
      message: 'saved',
      profiles: [],
    })
    const { rerender } = render(<AiConnectionsRegistry />)

    expect(screen.getByRole('alert')).toHaveTextContent('load failed')
    expect(screen.getByText('admin.aiConnections.empty')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'toast-dismiss' }))
    expect(mocks.state.setMessage).toHaveBeenCalledWith(null)
    await user.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(mocks.loadRegistry).toHaveBeenCalledOnce()

    mocks.state.error = { kind: 'mutation', message: 'mutation failed' }
    rerender(<AiConnectionsRegistry />)
    await user.click(screen.getByRole('button', { name: 'common.close' }))
    expect(mocks.state.clearError).toHaveBeenCalled()

    Object.assign(mocks.state, { error: null, loading: true, message: null })
    rerender(<AiConnectionsRegistry />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.aiConnections.loading',
    )
  })

  it('renders unavailable and suspended connection states with direct profile impact', async () => {
    const { connection, profile } = fixtures()
    connection.blockers = []
    connection.lifecycleStatus = 'suspended'
    profile.administrativeStatus = 'paused'
    profile.configurationStatus = 'blocked'
    profile.modelRevisionId = connection.models[0]?.revisions[0]?.id ?? null
    profile.operationalStatus = 'suspended'
    const unavailable: AiAdminConnectionDetail = {
      ...connection,
      adapterAvailability: {
        available: false,
        reason: 'adapter_not_registered',
      },
      administrationName: 'Unavailable connection',
      description: 'Unavailable adapter',
      id: '00000000-0000-4000-8000-000000000020',
      lifecycleStatus: 'retired',
      models: [],
      publicName: 'Unavailable',
      revisionToken: '00000000-0000-4000-8000-000000000021',
    }
    Object.assign(mocks.state, {
      connections: [connection, unavailable],
      details: {
        [connection.id]: connection,
        [unavailable.id]: unavailable,
      },
      profiles: [profile],
    })
    mocks.mutation.mockResolvedValueOnce(new Response('null'))
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)

    const suspendedRow = screen.getByRole('button', {
      name: /Admin connection/,
    })
    await user.click(suspendedRow)
    expect(
      screen.getAllByText('admin.aiConnections.directProfile.status.paused'),
    ).toHaveLength(2)
    const profileCard = screen
      .getByRole('heading', {
        level: 4,
        name: 'admin.aiConnections.profiles.generation_without_images',
      })
      .closest('article')
    if (!profileCard) throw new Error('Profile card missing')
    expect(within(profileCard).getAllByRole('status')).toHaveLength(1)
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.recoverConnection',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.probeHealth',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.retireConnection',
      }),
    )
    await user.click(suspendedRow)
    expect(suspendedRow).toHaveAttribute('aria-expanded', 'false')

    await user.click(
      screen.getByRole('button', { name: /Unavailable connection/ }),
    )
    expect(
      screen.getByText(/admin\.aiConnections\.adapter\.unavailable/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('admin.aiConnections.model.empty'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.fetchCatalog',
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.activateConnection',
      }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addModel',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'modal-close' }))
  })

  it('leaves destructive state unchanged when confirmations are rejected', async () => {
    mocks.confirm.mockResolvedValue(false)
    mocks.state.profiles = []
    const user = userEvent.setup()
    render(<AiConnectionsRegistry />)
    await user.click(
      screen.getByRole('button', {
        name: /Admin connection/,
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.destructive.end.confirm',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.destructive.delete.confirm',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.retireConnection',
      }),
    )
    expect(mocks.confirm).toHaveBeenCalledTimes(3)
    expect(mocks.mutateAndReload).not.toHaveBeenCalled()
  })
})
