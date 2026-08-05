import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PdfReportRenderer, {
  formatTimelineDate,
} from '@/components/reports/pdf/PdfReportRenderer'
import { loadStatusIconNodes } from '@/lib/icons/status-icon-allowlist'
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

vi.mock('@/lib/icons/status-icon-allowlist', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/icons/status-icon-allowlist')>()
  return {
    ...actual,
    getStatusIconNodes: (name: string | null | undefined) =>
      name === 'AllShapes'
        ? ([
            ['circle', { cx: '2', cy: '2', r: '1' }],
            ['ellipse', { cx: '4', cy: '4', rx: '2', ry: '1' }],
            ['line', { x1: '0', x2: '2', y1: '0', y2: '2' }],
            ['rect', { height: '2', width: '3', x: '1', y: '1' }],
            ['polygon', { points: '0,0 1,1 2,0' }],
            ['polyline', { points: '0,0 1,1' }],
            ['path', { d: 'M0 0h1' }],
            ['unsupported', {}],
          ] as never)
        : actual.getStatusIconNodes(name),
  }
})

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
  it('renders every report section through its public model contract', () => {
    const priority = {
      code: 'P1',
      color: '#1e3a8a',
      iconName: 'AllShapes',
      nameEn: 'High',
      nameSv: 'Hög',
    }
    const model = {
      orientation: 'landscape',
      sections: [
        {
          generatedAt: '2026-05-01T00:00:00.000Z',
          requirementId: 'REQ-1',
          status: { color: null, iconName: 'AllShapes', label: 'Review' },
          subtitle: 'Complete report',
          title: 'Report title',
          type: 'header',
        },
        { message: 'Information', severity: 'info', type: 'notice' },
        { message: 'Warning', severity: 'warning', type: 'notice' },
        {
          borderColor: '#123456',
          isUnpublished: true,
          label: 'Version 2',
          type: 'version-summary',
          version: {
            acceptanceCriteria: 'Acceptance criteria',
            archivedAt: null,
            category: { nameEn: 'Business', nameSv: 'Verksamhet' },
            createdAt: '2026-05-01T00:00:00.000Z',
            createdBy: 'Ada Admin',
            description: 'Description',
            editedAt: null,
            normReferences: [
              { name: 'ISO 27001', reference: 'A.1', uri: null },
            ],
            priorityLevel: priority,
            publishedAt: null,
            qualityCharacteristic: { nameEn: 'Security', nameSv: 'Säkerhet' },
            requirementPackages: [{ name: 'Baseline' }],
            status: {
              color: '#eab308',
              iconName: 'AllShapes',
              label: 'Review',
            },
            type: { nameEn: 'Functional', nameSv: 'Funktionellt' },
            verifiable: true,
            verificationMethod: 'Inspection',
            versionNumber: 2,
          },
        },
        {
          fieldLabel: 'Requirement text',
          segments: [
            { text: 'same ', type: 'unchanged' },
            { text: 'added ', type: 'added' },
            { text: 'removed', type: 'removed' },
          ],
          type: 'diff',
        },
        {
          changes: [
            { field: 'Text', newValue: 'New', oldValue: 'Old' },
            { field: 'Priority', newValue: priority, oldValue: null },
          ],
          type: 'metadata-changes',
        },
        {
          entry: {
            archivedAt: null,
            createdAt: '2026-05-01T00:00:00.000Z',
            createdBy: 'Ada Admin',
            descriptionExcerpt: 'Timeline excerpt',
            editedAt: null,
            publishedAt: null,
            status: {
              color: '#22c55e',
              iconName: 'AllShapes',
              label: 'Published',
            },
            versionNumber: 1,
          },
          type: 'timeline-entry',
        },
        {
          columns: [
            { key: 'uniqueId', label: 'ID' },
            { key: 'priorityLevel', label: 'Priority', width: '20%' },
            { key: 'status', label: 'Status' },
            { key: 'custom', label: 'Custom' },
          ],
          rows: [
            {
              cells: {
                custom: 'Value',
                status: 'Published',
                uniqueId: 'REQ-1',
              },
              priorityLevel: priority,
              statusColor: '#22c55e',
              statusIconName: 'AllShapes',
            },
          ],
          type: 'requirement-table',
        },
        {
          groups: [
            {
              heading: 'Statuses',
              items: [{ label: 'Published', value: '1' }],
            },
          ],
          metrics: [{ label: 'Total', value: '1' }],
          title: 'Summary',
          type: 'traceability-summary',
        },
        {
          labels: {
            area: 'Area',
            deviation: 'Deviation',
            needsReference: 'Need',
            note: 'Note',
            origin: 'Origin',
            priorityLevel: 'Priority',
            statusChangedAt: 'Changed',
            usageStatus: 'Usage',
            verification: 'Verification',
            version: 'Version',
          },
          rows: [
            {
              area: 'Security',
              deviation: 'None',
              needsReference: 'NEED-1',
              note: 'Follow up',
              origin: 'Library',
              priorityLevel: priority,
              requirementId: 'REQ-1',
              statusChangedAt: '2026-05-01',
              usageStatus: 'Included',
              verification: 'Inspection',
              version: '1',
            },
            {
              area: '',
              deviation: '',
              needsReference: '',
              note: '',
              origin: 'Local',
              priorityLevel: null,
              requirementId: 'LOCAL-1',
              statusChangedAt: '',
              usageStatus: '',
              verification: '',
              version: '',
            },
          ],
          type: 'traceability-table',
        },
        {
          rows: [
            {
              answerText: 'Yes',
              areaName: 'Security',
              changedAt: '2026-05-01',
              isHistorical: true,
              questionCode: 'Q1',
              questionText: 'Use MFA?',
              selectedByDisplayName: 'Ada Admin',
            },
            {
              answerText: 'No',
              areaName: 'Operations',
              changedAt: '2026-05-02',
              isHistorical: false,
              questionCode: 'Q2',
              questionText: 'Use legacy auth?',
              selectedByDisplayName: null,
            },
          ],
          title: 'Selection',
          type: 'requirement-selection-context',
        },
        {
          groups: [
            {
              heading: 'Reviews',
              items: [{ id: 'REQ-1', label: 'REQ-1', page: 2 }],
            },
          ],
          title: 'Contents',
          type: 'toc',
        },
        {
          businessNeedsReference: 'NEED-1',
          governanceObjectType: null,
          implementationType: 'Development',
          lifecycleStatus: null,
          locale: 'en',
          name: 'Specification',
          specificationCode: 'SPEC-1',
          type: 'specification-cover',
          variant: 'default',
        },
        {
          businessNeedsReference: null,
          governanceObjectType: null,
          implementationType: null,
          lifecycleStatus: null,
          locale: 'en',
          name: 'Minimal specification',
          specificationCode: 'SPEC-2',
          type: 'specification-cover',
          variant: 'minimal',
        },
        {
          createdAt: '2026-05-01T00:00:00.000Z',
          createdBy: 'Ada Admin',
          locale: 'en',
          motivation: 'Approved exception',
          priorityLevel: priority,
          specificationCode: 'SPEC-1',
          specificationName: 'Specification',
          type: 'deviation-summary',
        },
        { emptyLabel: 'No suggestions', items: [], type: 'suggestion-list' },
        {
          emptyLabel: 'No suggestions',
          heading: 'Suggestions',
          items: [
            {
              content: 'Improve wording',
              createdAt: '2026-05-01T00:00:00.000Z',
              createdBy: 'Ada Admin',
              resolutionMotivation: 'Applied',
              resolvedAt: '2026-05-02T00:00:00.000Z',
              resolvedBy: 'Rita Reviewer',
              status: { color: '#22c55e', label: 'Resolved' },
            },
            {
              content: 'Pending suggestion',
              createdAt: '2026-05-03T00:00:00.000Z',
              createdBy: null,
              resolutionMotivation: null,
              resolvedAt: null,
              resolvedBy: null,
              status: { color: '#3b82f6', label: 'Draft' },
            },
          ],
          type: 'suggestion-list',
        },
        { type: 'page-break' },
        { message: 'Second page', severity: 'info', type: 'notice' },
      ],
    } as unknown as ReportModel

    const output = renderReport(model, 'en')

    expect(output).toContain('Complete report')
    expect(output).toContain('Acceptance criteria')
    expect(output).toContain('Timeline excerpt')
    expect(output).toContain('historical')
    expect(output).toContain('Applied')
    expect(output).toContain('Second page')
    expect(output.match(/<section/g)).toHaveLength(2)
    expect(output).toContain('<circle')
    expect(output).toContain('<ellipse')
    expect(output).toContain('<line')
    expect(output).toContain('<rect')
    expect(output).toContain('<polygon')
    expect(output).toContain('<polyline')
    expect(output).toContain('<path')
  })

  it('renders complete structured priority identities in badge and dense inline variants', async () => {
    await loadStatusIconNodes('CircleAlert')
    const oldPriority = {
      code: 'P2',
      color: '#fde047',
      iconName: 'CircleAlert',
      nameEn: 'High',
      nameSv: 'Hög',
    }
    const newPriority = {
      code: 'P1',
      color: '#1e3a8a',
      iconName: null,
      nameEn: 'Critical priority with a representative long name',
      nameSv: 'Kritisk prioritet med ett representativt långt namn',
    }
    const model = {
      sections: [
        {
          type: 'metadata-changes',
          changes: [
            {
              field: 'Prioritet',
              oldValue: oldPriority,
              newValue: newPriority,
            },
          ],
        },
        {
          type: 'requirement-table',
          columns: [{ key: 'priorityLevel', label: 'Prioritet', width: '20%' }],
          rows: [{ cells: {}, priorityLevel: newPriority }],
        },
        {
          type: 'traceability-table',
          labels: {
            area: 'Område',
            deviation: 'Avsteg',
            needsReference: 'Behov',
            note: 'Notering',
            origin: 'Ursprung',
            priorityLevel: 'Prioritet',
            statusChangedAt: 'Ändrad',
            usageStatus: 'Status',
            verification: 'Verifiering',
            version: 'Version',
          },
          rows: [
            {
              area: '',
              deviation: '',
              needsReference: '',
              note: '',
              origin: 'Bibliotekskrav',
              priorityLevel: newPriority,
              requirementId: 'BEH0001',
              statusChangedAt: '',
              usageStatus: '',
              verification: '',
              version: '1',
            },
          ],
        },
      ],
    } as unknown as ReportModel

    const output = renderReport(model, 'sv')

    expect(output).toContain('P2 – Hög')
    expect(output).toContain(
      'P1 – Kritisk prioritet med ett representativt långt namn',
    )
    expect(output.match(/<svg/g)).toHaveLength(1)
    expect(output).not.toContain('UnknownIcon')
  })

  it('renders deviation priority identity against its amber PDF background', async () => {
    await loadStatusIconNodes('CircleAlert')
    const model = {
      sections: [
        {
          type: 'deviation-summary',
          createdAt: '2026-05-01T00:00:00.000Z',
          createdBy: null,
          locale: 'en',
          motivation: 'Needed for the implementation',
          priorityLevel: {
            code: 'P2',
            color: '#fde047',
            iconName: 'CircleAlert',
            nameEn: 'High',
            nameSv: 'Hög',
          },
          specificationCode: 'SPEC-1',
          specificationName: 'Specification',
        },
      ],
    } as ReportModel

    const output = renderReport(model, 'en')

    expect(output).toContain('P2 – High')
    expect(output.match(/<svg/g)).toHaveLength(1)
  })

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
