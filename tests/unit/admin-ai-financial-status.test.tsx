import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FinancialStatusPanel from '@/app/[locale]/admin/panels/settings/ai-connections/financial-status-panel'
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

describe('AI connection financial details', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiFetch).mockReset()
  })

  it('clears a previous report when the server cannot confirm its binding', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(Response.json(FINANCIAL_STATUS))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    render(<FinancialStatusPanel connection={connection} expanded />)
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
    await userEvent.click(await screen.findByRole('button', { name: 'verify' }))
    await screen.findByRole('alert')
    expect(screen.getByText('25.50 USD')).toBeVisible()
    expect(screen.getByText(/^verified /u)).toBeVisible()
    expect(screen.getByText('support.full')).toBeVisible()
    expect(screen.getByRole('button', { name: 'verify' })).toBeEnabled()
  })

  it('fetches only on opening and displays independent scopes, amounts, currency, periods and Developer Mode markers', async () => {
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
    expect(apiFetch).not.toHaveBeenCalled()
    rerender(<FinancialStatusPanel connection={connection} expanded />)
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
        '[data-developer-mode-name="AI provider financial status"]',
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

  it('shows safe transport errors and cancels obsolete requests when collapsed', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new Error('untrusted-server-error'),
    )
    const { rerender } = render(
      <FinancialStatusPanel connection={connection} expanded />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('requestFailed')
    let resolve!: (value: Response) => void
    vi.mocked(apiFetch).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done
        }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    rerender(<FinancialStatusPanel connection={connection} expanded={false} />)
    expect(vi.mocked(apiFetch).mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    await act(async () => {
      resolve(Response.json(FINANCIAL_STATUS))
    })
    expect(screen.queryByText('25.50 USD')).not.toBeInTheDocument()
  })
})
