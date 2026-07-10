import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RequirementReportMenu from '@/app/[locale]/requirements/[id]/_detail/RequirementReportMenu'
import { STATUS_REVIEW } from '@/lib/requirements/status-constants.mjs'

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

vi.mock('@/components/reports/pdf/useServerPdfDownload', () => ({
  useServerPdfDownload: () => ({
    clearError: vi.fn(),
    dialog: null,
    download: vi.fn(),
    downloading: false,
    error: null,
  }),
}))

describe('RequirementReportMenu', () => {
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
  })

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
    trigger.focus()
    await userEvent.keyboard('{Enter}')

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
})
