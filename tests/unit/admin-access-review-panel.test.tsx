import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccessReviewPanel from '@/app/[locale]/admin/panels/access-review-panel'
import { BUSINESS_TEXT_MAX_LENGTH } from '@/lib/http/validation-constants'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
}

function reviewDetail(
  status: 'cancelled' | 'completed' | 'draft' | 'in_review' = 'in_review',
  pendingCount = 1,
) {
  const actor = {
    displayName: 'Ada Admin',
    hsaId: 'SE5560000001-admin1',
  }
  return {
    items: [
      {
        comment: pendingCount ? null : 'Reviewed',
        createdAt: '2026-08-04T12:00:00.000Z',
        decidedAt: pendingCount ? null : '2026-08-04T12:30:00.000Z',
        decidedBy: pendingCount ? null : actor,
        decision: pendingCount ? 'pending' : 'approved',
        id: 7,
        permissionType: 'area_owner',
        principal: { displayName: 'no-user', hsaId: 'SE5560000001-owner1' },
        scope: { key: '1', label: 'Area one', type: 'requirement_area' },
        sourceKey: 'requirement_areas.owner',
        sourceTable: 'requirement_areas',
      },
    ],
    run: {
      completedAt: status === 'completed' ? '2026-08-04T13:00:00.000Z' : null,
      completedBy: status === 'completed' ? actor : null,
      createdAt: '2026-08-04T12:00:00.000Z',
      createdBy: actor,
      dueAt: '2027-08-04T12:00:00.000Z',
      externalEvidenceReference: 'IAM-42',
      id: 42,
      periodEnd: '2026-12-31T00:00:00.000Z',
      periodStart: '2026-01-01T00:00:00.000Z',
      reviewer: actor,
      status,
      summary: {
        approvedCount: pendingCount ? 0 : 1,
        changedCount: 0,
        itemCount: 1,
        notApplicableCount: 0,
        pendingCount,
        revokeRequiredCount: 0,
      },
      updatedAt: '2026-08-04T12:00:00.000Z',
    },
  }
}

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('AccessReviewPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(pendingFetch)
    vi.stubGlobal('fetch', fetchMock)
  })

  it('owns the access review tab panel contract', () => {
    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expectAdminPanelContract({
      markerValue: 'access review',
      tabId: 'accessReview',
    })
  })

  it('shows one load error and retries the run list', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(okJson({ runs: [] }))

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.accessReview.loadError',
    )
    expect(screen.getAllByText('admin.accessReview.loadError')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(await screen.findByText('admin.accessReview.noRuns')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the fallback message for a rejected run-list response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: vi.fn(async () => ''),
    } as unknown as Response)

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.accessReview.loadError',
    )
    expect(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    ).toBeDisabled()
  })

  it('records a pending assignment decision and completes the review', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/access-reviews') {
        return Promise.resolve(okJson({ runs: [reviewDetail().run] }))
      }
      if (url === '/api/admin/access-reviews/42/items/7') {
        expect(init?.method).toBe('PATCH')
        return Promise.resolve(okJson(reviewDetail('in_review', 0)))
      }
      if (url === '/api/admin/access-reviews/42/complete') {
        expect(init?.method).toBe('POST')
        return Promise.resolve(okJson(reviewDetail('completed', 0)))
      }
      return Promise.resolve(okJson(reviewDetail()))
    })

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })

    expect(await screen.findByText('Anonym')).toBeVisible()
    expect(screen.getByText('IAM-42')).toBeVisible()
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'changed' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: '' }), {
      target: { value: 'Responsibility changed' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    )

    const complete = await screen.findByRole('button', {
      name: 'admin.accessReview.complete',
    })
    fireEvent.click(complete)
    expect(
      await screen.findByText('admin.accessReview.completeSuccess'),
    ).toBeVisible()
  })

  it('reports a rejected review completion', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/admin/access-reviews') {
        return Promise.resolve(
          okJson({ runs: [reviewDetail('in_review', 0).run] }),
        )
      }
      if (url === '/api/admin/access-reviews/42/complete') {
        return Promise.resolve({
          ok: false,
          text: vi.fn(async () => ''),
        } as unknown as Response)
      }
      return Promise.resolve(okJson(reviewDetail('in_review', 0)))
    })

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'admin.accessReview.complete',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.accessReview.completeError',
    )
  })

  it('creates a review with trimmed external evidence', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/access-reviews' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          externalEvidenceReference: 'IAM-2026',
        })
        return Promise.resolve(okJson(reviewDetail()))
      }
      if (url === '/api/admin/access-reviews') {
        return Promise.resolve(okJson({ runs: [] }))
      }
      return Promise.resolve(okJson(reviewDetail()))
    })

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expect(await screen.findByText('admin.accessReview.noRuns')).toBeVisible()
    fireEvent.change(
      screen.getByLabelText('admin.accessReview.externalEvidenceReference'),
      { target: { value: '  IAM-2026  ' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    )
    expect(
      await screen.findByText('admin.accessReview.createSuccess'),
    ).toBeVisible()
  })

  it('keeps management controls hidden for read-only viewers', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url === '/api/admin/access-reviews'
          ? okJson({ runs: [reviewDetail('completed', 0).run] })
          : okJson(reviewDetail('completed', 0)),
      ),
    )

    renderAdminPanel(<AccessReviewPanel canManage={false} />, {
      confirmModal: true,
    })
    expect(await screen.findByText('Anonym')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'admin.accessReview.create' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'admin.accessReview.complete' }),
    ).toBeNull()
  })

  it('renders every run and decision status and cancels an open review', async () => {
    const detail = reviewDetail()
    detail.items = [
      ...detail.items,
      ...(
        ['approved', 'revoke_required', 'changed', 'not_applicable'] as const
      ).map((decision, index) => ({
        ...detail.items[0],
        comment: 'Reviewed',
        decision,
        id: index + 20,
      })),
    ]
    const runs = [
      detail.run,
      reviewDetail('draft').run,
      reviewDetail('completed', 0).run,
      reviewDetail('cancelled', 0).run,
    ].map((run, index) => ({ ...run, id: 42 + index }))
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/access-reviews') {
        return Promise.resolve(okJson({ runs }))
      }
      if (url === '/api/admin/access-reviews/42/cancel') {
        expect(init?.method).toBe('POST')
        return Promise.resolve(okJson(reviewDetail('cancelled', 0)))
      }
      return Promise.resolve(okJson(detail))
    })

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expect((await screen.findAllByText('Anonym')).length).toBeGreaterThan(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.accessReview.cancel' }),
    )
    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmDialog).getByRole('button', {
        name: 'admin.accessReview.cancel',
      }),
    )
    expect(
      await screen.findByText('admin.accessReview.cancelSuccess'),
    ).toBeVisible()
  })

  it('leaves an open review unchanged when cancellation is declined', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url === '/api/admin/access-reviews'
          ? okJson({ runs: [reviewDetail().run] })
          : okJson(reviewDetail()),
      ),
    )

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expect(await screen.findByText('Anonym')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.accessReview.cancel' }),
    )
    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: 'common.cancel' }),
    )

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports create and detail response failures', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ runs: [] }))
      .mockResolvedValueOnce({
        ok: false,
        text: vi.fn(async () => ''),
      } as unknown as Response)
    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expect(await screen.findByText('admin.accessReview.noRuns')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.accessReview.createError',
    )
  })

  it('rejects an overlong decision comment before sending it', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url === '/api/admin/access-reviews'
          ? okJson({ runs: [reviewDetail().run] })
          : okJson(reviewDetail()),
      ),
    )

    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expect(await screen.findByText('Anonym')).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: '' }), {
      target: { value: 'x'.repeat(BUSINESS_TEXT_MAX_LENGTH + 1) },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'admin.accessReview.commentTooLong',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
