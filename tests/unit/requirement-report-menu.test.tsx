import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RequirementReportMenu from '@/app/[locale]/requirements/[id]/_detail/RequirementReportMenu'

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
      'requirement.printHistoryReport': 'Print history',
      'requirement.printSuggestionHistoryReport': 'Print suggestion history',
    }

    return translations[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
}))

describe('RequirementReportMenu', () => {
  it('marks package report controls for Developer Mode', async () => {
    render(
      <RequirementReportMenu
        currentStatusId={0}
        detailContext="requirement package detail > inline detail pane: REQ-123"
        deviationStep={null}
        locale="sv"
        packageItemId={31}
        packageSlug="ETJANSTPLATT"
        requirementId={123}
        variant="package"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Print' })
    expect(trigger).toHaveAttribute(
      'data-developer-mode-context',
      'requirement package detail > inline detail pane: REQ-123',
    )
    expect(trigger).toHaveAttribute(
      'data-developer-mode-name',
      'report print button',
    )
    expect(trigger).toHaveAttribute(
      'data-developer-mode-value',
      'package reports',
    )

    await userEvent.click(trigger)

    expect(
      screen.getByRole('button', { name: 'Print history' }),
    ).toHaveAttribute('data-developer-mode-value', 'print history')
    expect(
      screen.getByRole('button', { name: 'Download suggestion history PDF' }),
    ).toHaveAttribute(
      'data-developer-mode-value',
      'download suggestion history pdf',
    )
  })

  it('marks package deviation review report options for Developer Mode', async () => {
    render(
      <RequirementReportMenu
        currentStatusId={0}
        detailContext="requirement package detail > inline detail pane: REQ-123"
        deviationStep="review_requested"
        locale="sv"
        packageItemId={31}
        packageSlug="ETJANSTPLATT"
        requirementId={123}
        variant="package"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(
      screen.getByRole('button', { name: 'Print deviation review' }),
    ).toHaveAttribute('data-developer-mode-value', 'print deviation review')
    expect(
      screen.getByRole('button', { name: 'Download deviation review PDF' }),
    ).toHaveAttribute(
      'data-developer-mode-value',
      'download deviation review pdf',
    )
  })
})
