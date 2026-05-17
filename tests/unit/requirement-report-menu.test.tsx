import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RequirementReportMenu from '@/app/[locale]/requirements/[id]/_detail/RequirementReportMenu'
import { STATUS_REVIEW } from '@/lib/requirements/status-constants.mjs'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, string> = {
      'common.print': 'Print',
      'deviation.downloadDeviationReviewReportPdf':
        'Download deviation review PDF',
      'deviation.printDeviationReviewReport': 'Print deviation review',
      'requirement.downloadHistoryReportPdf': 'Download history PDF',
      'requirement.downloadSuggestionHistoryReportPdf':
        'Download suggestion history PDF',
      'requirement.downloadReviewReportPdf': 'Download review PDF',
      'requirement.printHistoryReport': 'Print history',
      'requirement.printReviewReport': 'Print review',
      'requirement.printSuggestionHistoryReport': 'Print suggestion history',
    }

    return translations[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
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
        specificationItemId={31}
        specificationSlug="ETJANST-UPP-2026"
        variant="specification"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Print' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')
    expect(trigger).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail > inline detail pane: REQ-123',
    )
    expect(trigger).toHaveAttribute(
      'data-developer-mode-name',
      'report print button',
    )
    expect(trigger).toHaveAttribute(
      'data-developer-mode-value',
      'specification reports',
    )

    await userEvent.click(trigger)

    const reportMenu = screen.getByRole('menu', { name: 'Print' })
    expect(reportMenu).toHaveAttribute(
      'id',
      trigger.getAttribute('aria-controls'),
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('menuitem', { name: 'Print history' }),
    ).toHaveAttribute('data-developer-mode-value', 'print history')
    expect(
      screen.getByRole('menuitem', {
        name: 'Download suggestion history PDF',
      }),
    ).toHaveAttribute(
      'data-developer-mode-value',
      'download suggestion history pdf',
    )
  })

  it('marks specification deviation review report options for Developer Mode', async () => {
    render(
      <RequirementReportMenu
        currentStatusId={0}
        detailContext="requirements specification detail > inline detail pane: REQ-123"
        deviationStep="review_requested"
        locale="sv"
        requirementId={123}
        specificationItemId={31}
        specificationSlug="ETJANST-UPP-2026"
        variant="specification"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(
      screen.getByRole('menuitem', { name: 'Print deviation review' }),
    ).toHaveAttribute('data-developer-mode-value', 'print deviation review')
    expect(
      screen.getByRole('menuitem', { name: 'Download deviation review PDF' }),
    ).toHaveAttribute(
      'data-developer-mode-value',
      'download deviation review pdf',
    )
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

    const trigger = screen.getByRole('button', { name: 'Print' })
    await userEvent.click(trigger)

    const printHistory = screen.getByRole('menuitem', { name: 'Print history' })
    const downloadHistory = screen.getByRole('menuitem', {
      name: 'Download history PDF',
    })
    const downloadReview = screen.getByRole('menuitem', {
      name: 'Download review PDF',
    })

    expect(screen.getAllByRole('menuitem')).toHaveLength(6)
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    await waitFor(() => expect(printHistory).toHaveFocus())

    await userEvent.keyboard('{ArrowDown}')
    expect(downloadHistory).toHaveFocus()

    await userEvent.keyboard('{End}')
    expect(downloadReview).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(printHistory).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
