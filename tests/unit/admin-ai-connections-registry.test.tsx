import { render, screen, waitFor } from '@testing-library/react'
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
      <span>{children}</span>
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
      blockers: [{ code: 'model_revision_unverified' }],
      configurationStatus: 'blocked',
      configurationVersion: 1,
      id: '00000000-0000-4000-8000-000000000009',
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 16,
      maximumOutputBytes: 65_536,
      maximumOutputTokens: 1_536,
      maximumRetainedMemoryBytes: 131_072,
      modelRevisionId: null,
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
              : {},
          ),
        ),
    )
  })

  it('marks the surface and drives registry actions with anchored confirmations', async () => {
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
    expect(mocks.mutateAndReload).toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.suspendConnection',
      }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.verifyConnection',
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
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(5))

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

  it('disables registry actions and exposes loading status while mutating', () => {
    mocks.state.busy = true
    render(<AiConnectionsRegistry />)
    expect(screen.getByRole('status')).toHaveTextContent('common.saving')
    expect(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addConnection',
      }),
    ).toBeDisabled()
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
    profile.configurationStatus = 'unconfigured'
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
      screen.getAllByText(
        'admin.aiConnections.directProfile.configurationStatus.unconfigured',
      ),
    ).toHaveLength(2)
    expect(
      screen.getAllByText(
        'admin.aiConnections.directProfile.operationalStatus.suspended',
      ),
    ).toHaveLength(2)
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
