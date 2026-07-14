import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccessReviewPanel from '@/app/[locale]/admin/panels/access-review-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

const fetchMock = vi.fn()

function okJson(body: unknown): Response {
  return { json: vi.fn(async () => body), ok: true } as unknown as Response
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
})
