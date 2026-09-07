import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinancialStatusProvider } from '@/app/[locale]/admin/panels/settings/ai-connections/financial-status-context'
import FinancialDetails from '@/app/[locale]/admin/panels/settings/ai-connections/financial-status-panel'
import FinancialStatusSummary from '@/app/[locale]/admin/panels/settings/ai-connections/financial-status-summary'
import { FINANCIAL_STATUS } from '@/lib/__tests__/fixtures/ai-financial-status'
import type { AiAdminConnectionDetail } from '@/lib/ai/admin-service'
import { apiFetch } from '@/lib/http/api-fetch'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key,
}))
vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: vi.fn() }))
const confirm = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm }),
}))
const connection = {
  id: '00000000-0000-4000-8000-000000000001',
  configurationVersion: 1,
} as AiAdminConnectionDetail

function FinancialStatusPanel({
  connection,
  expanded,
}: {
  connection: AiAdminConnectionDetail
  expanded: boolean
}) {
  return (
    <FinancialStatusProvider
      connectionId={connection.id}
      key={`${connection.id}-${connection.configurationVersion}`}
    >
      {expanded ? (
        <FinancialDetails connection={connection} />
      ) : (
        <FinancialStatusSummary
          connectionId={connection.id}
          expanded={expanded}
          onToggle={vi.fn()}
        />
      )}
    </FinancialStatusProvider>
  )
}

function finiteStatus() {
  const status = structuredClone(FINANCIAL_STATUS)
  const snapshot = status.results[1].snapshot
  if (snapshot)
    snapshot.measurements = snapshot.measurements.map(item =>
      item.field === 'spending_limit'
        ? { ...item, amount: '50', state: 'available', period: 'lifetime' }
        : item.field === 'remaining_allowance'
          ? { ...item, amount: '24.5', state: 'available', period: 'lifetime' }
          : item,
    )
  return status
}

describe('AI connection financial details', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiFetch).mockReset()
  })

  it.each([
    'unsupported',
    'missing_credential',
    'invalid_credential',
    'temporary_error',
    'transport',
  ] as const)('explains %s without presenting a zero balance', async state => {
    const status = structuredClone(FINANCIAL_STATUS)
    if (state === 'transport')
      vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'))
    else {
      status.results = [{ ...status.results[0], state, snapshot: null }]
      if (state === 'unsupported')
        status.capabilities = { support: 'none', operations: [] }
      vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(status))
    }
    render(<FinancialStatusPanel connection={connection} expanded={false} />)
    const org = screen.getByRole('status', {
      name: 'summary.organization.title',
    })
    await waitFor(() => expect(org).toHaveAttribute('aria-busy', 'false'))
    expect(org).toHaveTextContent(
      `summary.state.${state === 'transport' ? 'temporary_error' : state}`,
    )
    expect(screen.queryByText('0.00 USD')).not.toBeInTheDocument()
  })

  it('shows total credits and remaining balance separately from the key limit and allowance, and fetches again on page entry', async () => {
    const status = finiteStatus()
    status.results = [
      {
        ...status.results[0],
        state: 'success',
        binding: 'account-binding',
        snapshot: {
          scope: 'account',
          measurements: [
            {
              field: 'purchased_credits',
              amount: '100',
              currency: 'USD',
              state: 'available',
              period: 'lifetime',
            },
            {
              field: 'credit_balance',
              amount: '99.125',
              currency: 'USD',
              state: 'available',
              period: 'lifetime',
            },
            {
              field: 'usage',
              amount: '0.875',
              currency: 'USD',
              state: 'available',
              period: 'lifetime',
            },
          ],
        },
      },
      status.results[1],
    ]
    vi.mocked(apiFetch).mockImplementation(async () => Response.json(status))
    const { unmount } = render(
      <FinancialStatusPanel connection={connection} expanded={false} />,
    )
    await screen.findByText('99.13 USD')
    expect(
      screen.getByRole('status', { name: 'summary.organization.title' }),
    ).toHaveTextContent('100.00 USD / 99.13 USD')
    expect(
      screen.getByRole('status', { name: 'summary.credential.title' }),
    ).toHaveTextContent('50.00 USD / 24.50 USD')
    expect(screen.queryByText('0.88 USD')).not.toBeInTheDocument()
    unmount()
    render(<FinancialStatusPanel connection={connection} expanded={false} />)
    await screen.findByText('99.13 USD')
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('matches the remaining allowance to the reported limit period', async () => {
    const status = finiteStatus()
    if (status.results[1].snapshot)
      status.results[1].snapshot.measurements = [
        {
          field: 'spending_limit',
          amount: '12.34',
          currency: 'USD',
          state: 'available',
          period: 'monthly',
        },
        {
          field: 'remaining_allowance',
          amount: '99',
          currency: 'USD',
          state: 'available',
          period: 'daily',
        },
        {
          field: 'remaining_allowance',
          amount: '8',
          currency: 'USD',
          state: 'available',
          period: 'monthly',
        },
      ]
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(status))
    render(<FinancialStatusPanel connection={connection} expanded={false} />)
    await screen.findByText('12.34 USD')
    expect(
      screen.getByRole('status', { name: 'summary.credential.title' }),
    ).toHaveTextContent('12.34 USD / 8.00 USD (summary.period.monthly)')
  })

  it('supports organization limits, unlimited key allowance and missing measurements without inventing amounts', async () => {
    const status = structuredClone(FINANCIAL_STATUS)
    status.results = [
      {
        ...status.results[0],
        operation: { ...status.results[0].operation, scope: 'organization' },
        state: 'success',
        snapshot: {
          scope: 'organization',
          measurements: [
            {
              field: 'spending_limit',
              amount: '100',
              currency: 'USD',
              state: 'available',
              period: 'lifetime',
            },
          ],
        },
      },
      {
        ...status.results[1],
        snapshot: {
          scope: 'credential',
          measurements: [
            {
              field: 'remaining_allowance',
              amount: null,
              currency: 'USD',
              state: 'unlimited',
              period: 'unknown',
            },
          ],
        },
      },
    ]
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(status))
    render(<FinancialStatusPanel connection={connection} expanded={false} />)
    await screen.findByText('100.00 USD')
    expect(
      screen.getByRole('status', { name: 'summary.organization.title' }),
    ).toHaveTextContent('100.00 USD / measurement.unavailable')
    expect(
      screen.getByRole('status', { name: 'summary.credential.title' }),
    ).toHaveTextContent('measurement.unavailable / measurement.unlimited')
  })

  it('refreshes the collapsed summary independently and shares stale values with the details', async () => {
    const status = finiteStatus()
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(status))
    const { rerender } = render(
      <FinancialStatusPanel connection={connection} expanded={false} />,
    )
    await screen.findByText('50.00 USD')
    const stale = structuredClone(status)
    stale.results = stale.results.map((result, index) =>
      index === 1
        ? {
            ...result,
            state: 'temporary_error',
            snapshot: null,
            lastSuccessfulAt: null,
          }
        : result,
    )
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(stale))
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'summary.credential.title' }),
      ).toHaveTextContent('50.00 USD / 24.50 USD (summary.stale)'),
    )
    expect(
      screen.queryByRole('button', { name: 'title' }),
    ).not.toBeInTheDocument()
    rerender(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    expect(screen.getByText('50.00 USD')).toBeVisible()
    expect(screen.getByText('25.50 USD')).toBeVisible()
    expect(screen.getByText('state.stale')).toBeVisible()
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it.each(['resolve', 'reject'] as const)(
    'cancels a pending credential mutation on page exit and ignores a late %s',
    async outcome => {
      let resolve!: (response: Response) => void
      let reject!: (error: Error) => void
      vi.mocked(apiFetch)
        .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
        .mockImplementationOnce(
          () =>
            new Promise((done, fail) => {
              resolve = done
              reject = fail
            }),
        )
      const { unmount } = render(
        <FinancialStatusPanel connection={connection} expanded />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'title' }))
      await userEvent.type(
        await screen.findByLabelText(/credentialLabel/u, { selector: 'input' }),
        'synthetic-candidate',
      )
      await userEvent.click(screen.getByRole('button', { name: 'register' }))
      unmount()
      expect(vi.mocked(apiFetch).mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
      await act(async () => {
        if (outcome === 'resolve') resolve(new Response(null, { status: 201 }))
        else reject(new Error('cancelled'))
      })
      expect(apiFetch).toHaveBeenCalledTimes(2)
    },
  )

  it('clears a previous report when the server cannot confirm its binding', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    await screen.findByText('25.50 USD')
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('requestFailed')
    expect(screen.queryByText('25.50 USD')).not.toBeInTheDocument()
    expect(screen.queryByText(/^lastSuccess /u)).not.toBeInTheDocument()
  })

  it('allows local cleanup after adapter support disappears and preserves state when removal is cancelled', async () => {
    const id = '00000000-0000-4000-8000-000000000099'
    vi.mocked(apiFetch).mockResolvedValueOnce(
      Response.json({
        capabilities: { support: 'none', operations: [] },
        results: [],
        managementCredential: {
          active: null,
          candidates: [{ id, createdAt: '2026-09-07T10:00:00Z' }],
        },
      }),
    )
    confirm.mockResolvedValueOnce(false)
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    await userEvent.click(
      await screen.findByRole('button', { name: 'discard' }),
    )
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByLabelText(/credentialLabel/u, { selector: 'input' }),
    ).not.toBeInTheDocument()
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new Error('refresh unavailable'))
    await userEvent.click(screen.getByRole('button', { name: 'discard' }))
    await screen.findByRole('alert')
    expect(apiFetch).toHaveBeenCalledTimes(3)
  })

  it('keeps a failed candidate verification separate from the active credential and financial reports', async () => {
    const id = '00000000-0000-4000-8000-000000000099'
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(
        Response.json({
          ...FINANCIAL_STATUS,
          capabilities: { ...FINANCIAL_STATUS.capabilities, support: 'full' },
          managementCredential: {
            active: { id: 'active', verifiedAt: '2026-09-07T09:00:00Z' },
            candidates: [{ id, createdAt: '2026-09-07T10:00:00Z' }],
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    await userEvent.click(await screen.findByRole('button', { name: 'verify' }))
    await screen.findByRole('alert')
    expect(screen.getByText('25.50 USD')).toBeVisible()
    expect(screen.getByText(/^verified /u)).toBeVisible()
    expect(screen.getByText('support.full')).toBeVisible()
    expect(screen.getByRole('button', { name: 'verify' })).toBeEnabled()
  })

  it('fetches on page entry and reuses the report when expanding accessible financial details', async () => {
    const status = structuredClone(FINANCIAL_STATUS)
    status.results[1].snapshot?.measurements.push(
      {
        field: 'usage',
        amount: '25.555',
        currency: 'USD',
        state: 'available',
        period: 'daily',
      },
      {
        field: 'usage',
        amount: '25.554',
        currency: 'USD',
        state: 'available',
        period: 'weekly',
      },
      {
        field: 'usage',
        amount: '0',
        currency: 'USD',
        state: 'available',
        period: 'monthly',
      },
    )
    vi.mocked(apiFetch).mockResolvedValue(Response.json(status))
    const { rerender, container } = render(
      <FinancialStatusPanel connection={connection} expanded={false} />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'summary.credential.title' }),
      ).toHaveTextContent('measurement.unlimited'),
    )
    expect(apiFetch).toHaveBeenCalledTimes(1)
    rerender(<FinancialStatusPanel connection={connection} expanded />)
    const toggle = screen.getByRole('button', { name: 'title' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('button', { name: 'refresh' }),
    ).not.toBeInTheDocument()
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('25.50 USD')).toBeVisible()
    expect(screen.getByText('25.56 USD')).toBeVisible()
    expect(screen.getByText('25.55 USD')).toBeVisible()
    expect(screen.getByText('0.00 USD')).toBeVisible()
    expect(screen.getByText('state.missing_credential')).toBeVisible()
    expect(screen.getByText('scope.credential')).toBeVisible()
    expect(screen.getByText('measurement.unlimited')).toBeVisible()
    expect(screen.getByText('providerReported')).toBeVisible()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false')
    expect(
      container.querySelector(
        '[data-developer-mode-name="AI organization and connection finances"]',
      ),
    ).toBeInTheDocument()
  })

  it('retains the original timestamp and values for a failed refresh with the same binding', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
      .mockResolvedValueOnce(
        Response.json({
          ...FINANCIAL_STATUS,
          results: FINANCIAL_STATUS.results.map(result =>
            result.operation.scope === 'credential'
              ? {
                  ...result,
                  state: 'invalid_credential',
                  snapshot: null,
                  lastSuccessfulAt: null,
                }
              : result,
          ),
        }),
      )
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    await screen.findByText('25.50 USD')
    const time = screen.getByText(/^lastSuccess /u).textContent
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }))
    expect(await screen.findByText('state.stale')).toBeVisible()
    expect(screen.getByText('state.invalid_credential')).toBeVisible()
    expect(screen.getByText('25.50 USD')).toBeVisible()
    expect(screen.getByText(/^lastSuccess /u).textContent).toBe(time)
  })

  it('does not carry a previous credential’s values into a replacement or a changed scope', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
      .mockResolvedValueOnce(
        Response.json({
          ...FINANCIAL_STATUS,
          results: [
            {
              ...FINANCIAL_STATUS.results[1],
              binding: 'replacement-credential',
              state: 'temporary_error',
              snapshot: null,
              lastSuccessfulAt: null,
            },
          ],
        }),
      )
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    await screen.findByText('25.50 USD')
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await screen.findByText('state.temporary_error')
    expect(screen.queryByText('25.50 USD')).not.toBeInTheDocument()
    expect(screen.queryByText(/^lastSuccess /u)).not.toBeInTheDocument()
  })

  it('explains unsupported adapters without requesting a management key', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({
        capabilities: { support: 'none', operations: [] },
        managementCredential: { active: null, candidates: [] },
        results: [],
      }),
    )
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    expect(await screen.findByText('support.none')).toBeVisible()
    expect(screen.queryByLabelText('credentialLabel')).not.toBeInTheDocument()
  })

  it('registers and clears secret input, verifies a candidate and removes the active credential locally', async () => {
    const id = '00000000-0000-4000-8000-000000000099'
    const candidateStatus = {
      ...FINANCIAL_STATUS,
      managementCredential: {
        active: null,
        candidates: [{ id, createdAt: '2026-09-07T10:00:00Z' }],
      },
    }
    const activeStatus = {
      ...FINANCIAL_STATUS,
      managementCredential: {
        active: { id, verifiedAt: '2026-09-07T10:00:00Z' },
        candidates: [],
      },
    }
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(Response.json(candidateStatus))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(activeStatus))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
    render(<FinancialStatusPanel connection={connection} expanded />)
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = await screen.findByLabelText(/credentialLabel/u, {
      selector: 'input',
    })
    await userEvent.type(input, 'management-test-secret')
    await userEvent.click(screen.getByRole('button', { name: 'register' }))
    expect(input).toHaveValue('')
    await userEvent.click(await screen.findByRole('button', { name: 'verify' }))
    await userEvent.click(await screen.findByRole('button', { name: 'remove' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(7))
    const bodies = vi
      .mocked(apiFetch)
      .mock.calls.map(([, init]) => JSON.parse(init?.body as string))
    expect(bodies).toEqual([
      { action: 'fetch_financial_status' },
      {
        action: 'write_management_credential',
        secret: 'management-test-secret',
      },
      { action: 'fetch_financial_status' },
      { action: 'verify_management_credential', secretVersionId: id },
      { action: 'fetch_financial_status' },
      { action: 'remove_management_credential', secretVersionId: id },
      { action: 'fetch_financial_status' },
    ])
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', message: 'removeHelp' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false'),
    )
  })

  it('shows safe transport errors and cancels obsolete requests when leaving the page', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new Error('untrusted-server-error'),
    )
    const { unmount } = render(
      <FinancialStatusPanel connection={connection} expanded />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('requestFailed')
    let resolve!: (value: Response) => void
    vi.mocked(apiFetch).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done
        }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    unmount()
    expect(vi.mocked(apiFetch).mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    await act(async () => {
      resolve(Response.json(FINANCIAL_STATUS))
    })
    expect(screen.queryByText('25.50 USD')).not.toBeInTheDocument()
  })
})
