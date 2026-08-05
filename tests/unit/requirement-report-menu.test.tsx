import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementReportMenu from '@/app/[locale]/requirements/[id]/_detail/RequirementReportMenu'
import { STATUS_REVIEW } from '@/lib/requirements/status-constants.mjs'

const downloadState = vi.hoisted(() => ({
  clearError: vi.fn(),
  download: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, string> = {
      'common.reports': 'Reports',
      'deviation.downloadDeviationReviewReportPdf': 'Deviation Review Report',
      'requirement.downloadHistoryReportPdf': 'History Report',
      'requirement.downloadSuggestionHistoryReportPdf':
        'Improvement Suggestion History',
      'requirement.downloadReviewReportPdf': 'Review Report',
    }

    return translations[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
}))

vi.mock('@/components/generated-output/useGeneratedOutputDownload', () => ({
  useGeneratedOutputDownload: () => ({
    clearError: downloadState.clearError,
    dialog: null,
    download: downloadState.download,
    downloading: false,
    error: null,
  }),
}))

describe('RequirementReportMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hides reports while a specification deviation is still a draft', () => {
    const { container } = render(
      <RequirementReportMenu
        currentStatusId={0}
        deviationStep="draft"
        locale="en"
        requirementId={123}
        specificationId={1}
        specificationItemId={31}
        variant="specification"
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('marks specification report controls for Developer Mode', async () => {
    render(
      <RequirementReportMenu
        currentStatusId={0}
        detailContext="requirements specification detail > inline detail pane: REQ-123"
        deviationStep={null}
        locale="sv"
        requirementId={123}
        specificationId={1}
        specificationItemId={31}
        variant="specification"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Reports' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')
    expect(trigger).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail > inline detail pane: REQ-123',
    )
    expect(trigger).toHaveAttribute('data-developer-mode-name', 'report button')
    expect(trigger).toHaveAttribute(
      'data-developer-mode-value',
      'specification reports',
    )

    await userEvent.click(trigger)

    const reportMenu = screen.getByRole('menu', { name: 'Reports' })
    expect(reportMenu).toHaveAttribute(
      'id',
      trigger.getAttribute('aria-controls'),
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('menuitem', { name: 'History Report' }),
    ).toHaveAttribute('data-developer-mode-value', 'history report')
    expect(
      screen.getByRole('menuitem', {
        name: 'Improvement Suggestion History',
      }),
    ).toHaveAttribute('data-developer-mode-value', 'suggestion history report')
  })

  it('marks specification deviation review report options for Developer Mode', async () => {
    render(
      <RequirementReportMenu
        currentStatusId={0}
        detailContext="requirements specification detail > inline detail pane: REQ-123"
        deviationStep="review_requested"
        locale="sv"
        requirementId={123}
        specificationId={1}
        specificationItemId={31}
        variant="specification"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reports' }))

    expect(
      screen.getByRole('menuitem', { name: 'Deviation Review Report' }),
    ).toHaveAttribute('data-developer-mode-value', 'deviation review report')

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Deviation Review Report' }),
    )
    expect(downloadState.download).toHaveBeenCalledWith({
      fallbackFilename: 'deviation-review-report-123.pdf',
      url: '/sv/requirements/reports/pdf/deviation-review/123?spec=1&item=31',
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it.each([
    [
      'History Report',
      '/en/requirements/reports/pdf/history/123',
      'history-report-123.pdf',
    ],
    [
      'Improvement Suggestion History',
      '/en/requirements/reports/pdf/suggestion-history/123',
      'suggestion-history-report-123.pdf',
    ],
  ])(
    'downloads the specification %s',
    async (reportName, url, fallbackFilename) => {
      render(
        <RequirementReportMenu
          currentStatusId={0}
          deviationStep={null}
          locale="en"
          requirementId={123}
          specificationId={1}
          specificationItemId={31}
          variant="specification"
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
      await userEvent.click(screen.getByRole('menuitem', { name: reportName }))

      expect(downloadState.download).toHaveBeenCalledWith({
        fallbackFilename,
        url,
      })
    },
  )

  it('supports standalone report menu keyboard navigation', async () => {
    render(
      <RequirementReportMenu
        currentStatusId={STATUS_REVIEW}
        detailContext="requirement detail: REQ-123"
        locale="sv"
        requirementId={123}
        variant="standalone"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Reports' })
    await userEvent.click(trigger)

    const historyReport = screen.getByRole('menuitem', {
      name: 'History Report',
    })
    const reviewReport = screen.getByRole('menuitem', {
      name: 'Review Report',
    })

    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    await waitFor(() => expect(historyReport).toHaveFocus())

    await userEvent.keyboard('{ArrowDown}')
    expect(
      screen.getByRole('menuitem', { name: 'Improvement Suggestion History' }),
    ).toHaveFocus()

    await userEvent.keyboard('{End}')
    expect(reviewReport).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(historyReport).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it.each([
    [
      'History Report',
      '/sv/requirements/reports/pdf/history/123',
      'history-report-123.pdf',
    ],
    [
      'Improvement Suggestion History',
      '/sv/requirements/reports/pdf/suggestion-history/123',
      'suggestion-history-report-123.pdf',
    ],
    [
      'Review Report',
      '/sv/requirements/reports/pdf/review/123',
      'review-report-123.pdf',
    ],
  ])(
    'downloads the standalone %s',
    async (reportName, url, fallbackFilename) => {
      render(
        <RequirementReportMenu
          currentStatusId={STATUS_REVIEW}
          locale="sv"
          requirementId={123}
          variant="standalone"
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Reports' }))
      await userEvent.click(screen.getByRole('menuitem', { name: reportName }))

      expect(downloadState.download).toHaveBeenCalledWith({
        fallbackFilename,
        url,
      })
    },
  )
})
