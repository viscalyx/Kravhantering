import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PdfReportRenderer, {
  formatTimelineDate,
} from '@/components/reports/pdf/PdfReportRenderer'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { buildCombinedReviewReport } from '@/lib/reports/templates/combined-review-template'
import { buildHistoryReport } from '@/lib/reports/templates/history-template'
import { buildReviewReport } from '@/lib/reports/templates/review-template'
import type { ReportModel, TimelineEntryData } from '@/lib/reports/types'

vi.mock('@react-pdf/renderer', () => ({
  Circle: 'circle',
  Document: 'div',
  Ellipse: 'ellipse',
  Line: 'line',
  Page: 'section',
  Path: 'path',
  Polygon: 'polygon',
  Polyline: 'polyline',
  Rect: 'rect',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Svg: 'svg',
  Text: 'span',
  View: 'div',
}))

function makeVersion(
  overrides: Partial<RequirementReportData['versions'][number]> = {},
): RequirementReportData['versions'][number] {
  return {
    acceptanceCriteria: 'Acceptance criteria',
    archiveInitiatedAt: null,
    archivedAt: null,
    category: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: null,
    description: 'Requirement description',
    editedAt: null,
    id: 1,
    priorityLevel: null,
    publishedAt: null,
    qualityCharacteristic: null,
    status: 3,
    statusColor: '#22c55e',
    statusIconName: null,
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    type: null,
    verifiable: false,
    verificationMethod: null,
    versionNormReferences: [],
    versionNumber: 1,
    versionRequirementPackages: [],
    ...overrides,
  }
}

function makeRequirement(): RequirementReportData {
  return {
    area: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    id: 1,
    isArchived: false,
    uniqueId: 'REQ-520',
    versions: [
      makeVersion({
        archivedAt: '2026-05-02T00:00:00.000Z',
        id: 1,
        status: 4,
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
        versionNumber: 1,
      }),
      makeVersion({
        id: 2,
        publishedAt: '2026-05-03T00:00:00.000Z',
        versionNumber: 2,
      }),
      makeVersion({
        id: 3,
        status: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
        verifiable: true,
        versionNumber: 3,
      }),
      makeVersion({
        editedAt: '2026-05-04T00:00:00.000Z',
        id: 4,
        status: 1,
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
        versionNumber: 4,
      }),
    ],
  }
}

function renderReport(model: ReportModel, locale: 'en' | 'sv'): string {
  return renderToStaticMarkup(
    createElement(PdfReportRenderer, { locale, model }),
  )
}

function timelineEntry(
  overrides: Partial<TimelineEntryData> = {},
): TimelineEntryData {
  return {
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: null,
    descriptionExcerpt: null,
    editedAt: null,
    publishedAt: null,
    status: { color: null, label: 'Status' },
    versionNumber: 1,
    ...overrides,
  }
}

describe('PDF report renderer localization', () => {
  it('renders Swedish review, combined-review, and history structure', () => {
    const requirement = makeRequirement()
    const reports = [
      buildReviewReport(requirement, 'sv'),
      buildCombinedReviewReport([requirement], 'sv'),
      buildHistoryReport(requirement, 'sv'),
    ]
    const output = reports.map(report => renderReport(report, 'sv')).join('\n')

    expect(output).toContain('Metadataändringar')
    expect(output).toContain('Fält')
    expect(output).toContain('Tidigare')
    expect(output).toContain('Nytt')
    expect(output).toContain('Publicerad:')
    expect(output).toContain('Arkiverad:')
    expect(output).toContain('Redigerad:')
    expect(output).toContain('Skapad:')
    expect(output).not.toContain('Metadata Changes')
    expect(output).not.toContain('Previous')

    const lifecycleDates = formatTimelineDate(
      timelineEntry({
        archivedAt: '2026-05-03T00:00:00.000Z',
        editedAt: '2026-05-04T00:00:00.000Z',
        publishedAt: '2026-05-02T00:00:00.000Z',
      }),
      'sv',
    )
    expect(lifecycleDates).toContain('Publicerad:')
    expect(lifecycleDates).toContain('Arkiverad:')
    expect(lifecycleDates).toContain('Redigerad:')
    expect(lifecycleDates).not.toContain('Skapad:')
    expect(formatTimelineDate(timelineEntry(), 'sv')).toContain('Skapad:')
  })

  it('preserves English review, combined-review, and history structure', () => {
    const requirement = makeRequirement()
    const reports = [
      buildReviewReport(requirement, 'en'),
      buildCombinedReviewReport([requirement], 'en'),
      buildHistoryReport(requirement, 'en'),
    ]
    const output = reports.map(report => renderReport(report, 'en')).join('\n')

    expect(output).toContain('Metadata Changes')
    expect(output).toContain('Field')
    expect(output).toContain('Previous')
    expect(output).toContain('New')
    expect(output).toContain('Published:')
    expect(output).toContain('Archived:')
    expect(output).toContain('Edited:')
    expect(output).toContain('Created:')
    expect(output).not.toContain('Metadataändringar')
    expect(output).not.toContain('Tidigare')

    const lifecycleDates = formatTimelineDate(
      timelineEntry({
        archivedAt: '2026-05-03T00:00:00.000Z',
        editedAt: '2026-05-04T00:00:00.000Z',
        publishedAt: '2026-05-02T00:00:00.000Z',
      }),
      'en',
    )
    expect(lifecycleDates).toContain('Published:')
    expect(lifecycleDates).toContain('Archived:')
    expect(lifecycleDates).toContain('Edited:')
    expect(lifecycleDates).not.toContain('Created:')
    expect(formatTimelineDate(timelineEntry(), 'en')).toContain('Created:')
  })
})
