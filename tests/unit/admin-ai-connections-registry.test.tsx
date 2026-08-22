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
  default: ({ message }: { message: string }) => <p>{message}</p>,
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
      onWrite(secret: string): void
    }) => (
      <div>
        <button onClick={() => onWrite('secret')} type="button">
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
      onRegisterClose,
    }: {
      onCancel(): void
      onComplete(): void
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
    const { connection, profile } = fixtures()
    Object.assign(mocks.state, {
      busy: false,
      candidateBlockers: {},
      clearError: vi.fn(),
      connections: [],
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
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(3))

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.manageAttestation',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'attestation-save' }))
    await user.click(
      screen.getByRole('button', { name: 'attestation-discard' }),
    )
    await user.click(screen.getByRole('button', { name: 'attestation-attest' }))

    await user.click(
      screen.getByRole('button', {
        name: 'admin.aiConnections.actions.addModel',
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
})
