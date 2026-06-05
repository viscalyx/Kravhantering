import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrintReportRenderer from '@/components/reports/print/PrintReportRenderer'
import type { ReportModel, VersionSummaryData } from '@/lib/reports/types'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

function makeVersion(
  overrides: Partial<VersionSummaryData> = {},
): VersionSummaryData {
  return {
    acceptanceCriteria: null,
    archivedAt: null,
    category: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: null,
    description: null,
    editedAt: null,
    normReferences: [],
    publishedAt: null,
    qualityCharacteristic: null,
    requirementPackages: [],
    requiresTesting: false,
    riskLevel: null,
    status: { color: null, label: 'Published' },
    type: null,
    verificationMethod: null,
    versionNumber: 1,
    ...overrides,
  }
}

function renderVersionSummary(version: VersionSummaryData) {
  const model: ReportModel = {
    sections: [
      {
        type: 'version-summary',
        version,
      },
    ],
  }

  render(<PrintReportRenderer locale="en" model={model} />)
}

describe('PrintReportRenderer', () => {
  it('trims and skips blank requirement package names', () => {
    renderVersionSummary(
      makeVersion({
        requirementPackages: [
          { name: '  Mobile use  ' },
          { name: '' },
          { name: '   ' },
        ],
      }),
    )

    expect(screen.getByText('Mobile use')).toBeInTheDocument()
    expect(screen.queryByText('Mobile use,')).not.toBeInTheDocument()
  })

  it('renders a placeholder when linked requirement packages have no names', () => {
    renderVersionSummary(
      makeVersion({
        requirementPackages: [{ name: '' }, { name: '   ' }],
      }),
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
