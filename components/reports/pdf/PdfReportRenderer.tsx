import {
  Circle,
  Document,
  Ellipse,
  Line,
  Page,
  Path,
  Polygon,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer'
import { getStatusIconNodes } from '@/lib/icons/status-icon-allowlist'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import {
  formatReportBoolean,
  getReportLabels,
  getReportMessages,
  localizeReportValue,
  type ReportMessages,
} from '@/lib/reports/report-labels'
import type {
  DiffSegment,
  MetadataChange,
  ReportModel,
  ReportSection,
  SuggestionReportItem,
  TimelineEntryData,
} from '@/lib/reports/types'

type SpecificationCoverLabelKey = keyof ReportMessages['specificationCover']
type ReportLabelKey = 'historicalSelectionAnswer'

function getSpecificationCoverLabel(
  locale: string,
  key: SpecificationCoverLabelKey,
): string {
  return getReportMessages(locale).specificationCover[key]
}

function getReportLabel(locale: string, key: ReportLabelKey): string {
  return getReportMessages(locale)[key]
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: 9,
    color: '#64748b',
    marginBottom: 2,
  },
  headerDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#e2e8f0',
    marginBottom: 12,
    paddingBottom: 8,
  },
  noticeBox: {
    padding: 8,
    borderLeftWidth: 3,
    borderRadius: 2,
    marginBottom: 8,
    fontSize: 9,
  },
  noticeInfo: {
    backgroundColor: '#eff6ff',
    borderLeftColor: '#3b82f6',
    color: '#1e40af',
  },
  noticeWarning: {
    backgroundColor: '#fef3c7',
    borderLeftColor: '#f59e0b',
    color: '#92400e',
  },
  versionBox: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  versionLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 9,
    color: '#4b5563',
    marginBottom: 6,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  metadataItem: {
    width: '48%',
    fontSize: 8,
    color: '#6b7280',
  },
  metadataItemLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  diffContainer: {
    padding: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    marginBottom: 8,
  },
  diffSectionLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  diffAdded: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  diffRemoved: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    textDecoration: 'line-through',
  },
  table: {
    width: '100%',
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#64748b',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 3,
  },
  tableCell: {
    fontSize: 8,
  },
  tableCellField: {
    width: '30%',
    fontFamily: 'Helvetica-Bold',
  },
  tableCellOld: {
    width: '35%',
    color: '#991b1b',
  },
  tableCellNew: {
    width: '35%',
    color: '#166534',
  },
  timelineEntry: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    paddingLeft: 4,
    borderLeftWidth: 1.5,
    borderLeftColor: '#e2e8f0',
  },
  timelineVersion: {
    width: 36,
    alignItems: 'center',
  },
  timelineVersionNumber: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
  },
  timelineContent: {
    flex: 1,
    fontSize: 8,
  },
  timelineMeta: {
    color: '#64748b',
    marginBottom: 2,
  },
  timelineExcerpt: {
    color: '#4b5563',
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    fontSize: 7,
  },
  tocTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 4,
  },
  tocItem: {
    fontSize: 9,
    color: '#4b5563',
    marginBottom: 2,
    paddingLeft: 8,
  },
})

interface PdfReportRendererProps {
  locale: string
  model: ReportModel
}

export default function PdfReportRenderer({
  model,
  locale,
}: PdfReportRendererProps) {
  const pages = splitIntoPages(model.sections)

  return (
    <Document>
      {pages.map((pageSections, pageIndex) => (
        <Page
          // biome-ignore lint/suspicious/noArrayIndexKey: static report pages
          key={pageIndex}
          orientation={model.orientation ?? 'portrait'}
          size="A4"
          style={styles.page}
        >
          {pageSections.map((section, sectionIndex) => (
            <PdfSectionRenderer
              // biome-ignore lint/suspicious/noArrayIndexKey: static report sections
              key={sectionIndex}
              locale={locale}
              section={section}
            />
          ))}
        </Page>
      ))}
    </Document>
  )
}

function splitIntoPages(sections: ReportSection[]): ReportSection[][] {
  const pages: ReportSection[][] = []
  let current: ReportSection[] = []

  for (const section of sections) {
    if (section.type === 'page-break' && current.length > 0) {
      pages.push(current)
      current = []
    } else {
      current.push(section)
    }
  }

  if (current.length > 0) {
    pages.push(current)
  }

  return pages.length > 0 ? pages : [[]]
}

function PdfSectionRenderer({
  section,
  locale,
}: {
  section: ReportSection
  locale: string
}) {
  switch (section.type) {
    case 'header':
      return <PdfHeader locale={locale} section={section} />
    case 'notice':
      return <PdfNotice section={section} />
    case 'version-summary':
      return <PdfVersionSummary locale={locale} section={section} />
    case 'diff':
      return <PdfDiff section={section} />
    case 'metadata-changes':
      return <PdfMetadataChanges locale={locale} section={section} />
    case 'timeline-entry':
      return <PdfTimelineEntry locale={locale} section={section} />
    case 'requirement-table':
      return <PdfRequirementTable section={section} />
    case 'traceability-summary':
      return <PdfTraceabilitySummary section={section} />
    case 'traceability-table':
      return <PdfTraceabilityTable section={section} />
    case 'requirement-selection-context':
      return (
        <PdfRequirementSelectionContext locale={locale} section={section} />
      )
    case 'toc':
      return <PdfToc section={section} />
    case 'specification-cover':
      return <PdfSpecificationCover section={section} />
    case 'page-break':
      return null
    case 'deviation-summary':
      return <PdfDeviationSummary section={section} />
    case 'suggestion-list':
      return <PdfSuggestionList locale={locale} section={section} />
    default:
      return null
  }
}

function PdfRequirementSelectionContext({
  locale,
  section,
}: {
  locale: string
  section: Extract<ReportSection, { type: 'requirement-selection-context' }>
}) {
  const historicalSelectionAnswerLabel = getReportLabel(
    locale,
    'historicalSelectionAnswer',
  )
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
        {section.title}
      </Text>
      {section.rows.map(row => {
        const selectedByDisplayName = formatActorDisplayNameForLocale(
          row.selectedByDisplayName,
          locale,
        )
        return (
          <View
            key={`${row.questionCode}-${row.answerText}`}
            style={[styles.tableRow, { borderTopWidth: 1, paddingVertical: 5 }]}
          >
            <Text style={[styles.tableCell, { flex: 1.2 }]}>
              {row.areaName} {row.questionCode}
            </Text>
            <Text style={[styles.tableCell, { flex: 2 }]}>
              {row.questionText}
            </Text>
            <Text style={[styles.tableCell, { flex: 1.5 }]}>
              {row.answerText}
              {row.isHistorical ? ` ${historicalSelectionAnswerLabel}` : ''}
              {`\n${row.changedAt}${
                selectedByDisplayName ? ` · ${selectedByDisplayName}` : ''
              }`}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function PdfSpecificationCover({
  section,
}: {
  section: Extract<ReportSection, { type: 'specification-cover' }>
}) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={[styles.headerTitle, { fontSize: 22, marginBottom: 8 }]}>
        {section.name}
      </Text>
      <View style={styles.metadataGrid}>
        <View style={styles.metadataItem}>
          <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
            {getSpecificationCoverLabel(section.locale, 'specificationCode')}
          </Text>
          <Text style={[styles.fieldValue, { fontFamily: 'Helvetica-Bold' }]}>
            {section.specificationCode}
          </Text>
        </View>
        {section.variant !== 'minimal' && (
          <>
            <View style={styles.metadataItem}>
              <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
                {getSpecificationCoverLabel(
                  section.locale,
                  'governanceObjectType',
                )}
              </Text>
              <Text style={styles.fieldValue}>
                {section.governanceObjectType ?? '—'}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
                {getSpecificationCoverLabel(
                  section.locale,
                  'implementationType',
                )}
              </Text>
              <Text style={styles.fieldValue}>
                {section.implementationType ?? '—'}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
                {getSpecificationCoverLabel(section.locale, 'lifecycleStatus')}
              </Text>
              <Text style={styles.fieldValue}>
                {section.lifecycleStatus ?? '—'}
              </Text>
            </View>
          </>
        )}
        {section.variant !== 'minimal' && section.businessNeedsReference && (
          <View style={{ width: '100%' }}>
            <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
              {getSpecificationCoverLabel(
                section.locale,
                'businessNeedsReference',
              )}
            </Text>
            <Text style={styles.fieldValue}>
              {section.businessNeedsReference}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

function PdfHeader({
  locale,
  section,
}: {
  locale: string
  section: Extract<ReportSection, { type: 'header' }>
}) {
  return (
    <View style={styles.headerDivider}>
      <Text style={styles.headerTitle}>{section.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[styles.headerMeta, { fontFamily: 'Helvetica-Bold' }]}>
          {section.requirementId}
        </Text>
        {section.subtitle && (
          <Text style={styles.headerMeta}>{section.subtitle}</Text>
        )}
        {section.status && (
          <PdfBadge
            color={section.status.color}
            iconName={section.status.iconName}
            label={section.status.label}
          />
        )}
      </View>
      <Text style={[styles.headerMeta, { fontSize: 8 }]}>
        {new Date(section.generatedAt).toLocaleString(locale)}
      </Text>
    </View>
  )
}

function PdfNotice({
  section,
}: {
  section: Extract<ReportSection, { type: 'notice' }>
}) {
  const variantStyle =
    section.severity === 'warning' ? styles.noticeWarning : styles.noticeInfo
  return (
    <View style={[styles.noticeBox, variantStyle]}>
      <Text>{section.message}</Text>
    </View>
  )
}

function PdfVersionSummary({
  section,
  locale,
}: {
  section: Extract<ReportSection, { type: 'version-summary' }>
  locale: string
}) {
  const { version, label, isUnpublished, borderColor: customBorder } = section
  const borderColor = customBorder ?? (isUnpublished ? '#eab308' : '#22c55e')
  const labels = getReportLabels(locale)

  const getName = (item: { nameSv: string; nameEn: string } | null) => {
    if (!item) return null
    return localizeReportValue(locale, item.nameSv, item.nameEn)
  }
  const requirementPackageNames = version.requirementPackages
    .map(requirementPackage => requirementPackage.name)
    .filter(name => name.length > 0)
  const { createdBy: createdByLabel } = labels.columns
  const createdBy = formatActorDisplayNameForLocale(version.createdBy, locale)

  return (
    <View style={[styles.versionBox, { borderColor }]}>
      {label && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginBottom: 6,
          }}
        >
          <Text style={styles.versionLabel}>{label}</Text>
          <PdfBadge
            color={version.status.color}
            iconName={version.status.iconName}
            label={version.status.label}
          />
        </View>
      )}
      {version.description && (
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.fieldLabel}>{labels.columns.description}</Text>
          <Text style={styles.fieldValue}>{version.description}</Text>
        </View>
      )}
      {version.acceptanceCriteria && (
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.fieldLabel}>
            {labels.columns.acceptanceCriteria}
          </Text>
          <Text style={styles.fieldValue}>{version.acceptanceCriteria}</Text>
        </View>
      )}
      <View style={styles.metadataGrid}>
        {getName(version.category) && (
          <PdfMetadataItem
            label={labels.columns.category}
            value={getName(version.category)}
          />
        )}
        {getName(version.type) && (
          <PdfMetadataItem
            label={labels.columns.type}
            value={getName(version.type)}
          />
        )}
        {getName(version.qualityCharacteristic) && (
          <PdfMetadataItem
            label={labels.columns.qualityCharacteristic}
            value={getName(version.qualityCharacteristic)}
          />
        )}
        {getName(version.priorityLevel) && (
          <PdfMetadataItem
            iconName={version.priorityLevel?.iconName}
            label={labels.columns.priorityLevel}
            value={getName(version.priorityLevel)}
          />
        )}
        <PdfMetadataItem
          label={labels.columns.verifiable}
          value={formatReportBoolean(version.verifiable, labels)}
        />
        {createdBy && (
          <PdfMetadataItem label={createdByLabel} value={createdBy} />
        )}
      </View>
      {version.normReferences.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 8, color: '#6b7280' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#374151' }}>
              {labels.columns.referencesValue}
            </Text>
            {version.normReferences.map(r => r.name).join(', ')}
          </Text>
        </View>
      )}
      {requirementPackageNames.length > 0 && (
        <View style={{ marginTop: 2 }}>
          <Text style={{ fontSize: 8, color: '#6b7280' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#374151' }}>
              {labels.columns.requirementPackagesValue}
            </Text>
            {requirementPackageNames.join(', ')}
          </Text>
        </View>
      )}
    </View>
  )
}

function PdfMetadataItem({
  iconName,
  label,
  value,
}: {
  iconName?: string | null
  label: string
  value: string | null
}) {
  if (!value) return null
  return (
    <View style={[styles.metadataItem, { flexDirection: 'row', gap: 2 }]}>
      <Text style={styles.metadataItemLabel}>{label}: </Text>
      <PdfStatusIcon name={iconName} />
      <Text>{value}</Text>
    </View>
  )
}

function PdfDiff({
  section,
}: {
  section: Extract<ReportSection, { type: 'diff' }>
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.diffSectionLabel}>{section.fieldLabel}</Text>
      <View style={styles.diffContainer}>
        <Text style={{ fontSize: 9, lineHeight: 1.6 }}>
          {section.segments.map((segment, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static diff segments
            <PdfDiffSegment key={i} segment={segment} />
          ))}
        </Text>
      </View>
    </View>
  )
}

function PdfDiffSegment({ segment }: { segment: DiffSegment }) {
  if (segment.type === 'unchanged') {
    return <Text>{segment.text}</Text>
  }
  if (segment.type === 'added') {
    return <Text style={styles.diffAdded}>{segment.text}</Text>
  }
  return <Text style={styles.diffRemoved}>{segment.text}</Text>
}

function PdfMetadataChanges({
  locale,
  section,
}: {
  locale: string
  section: Extract<ReportSection, { type: 'metadata-changes' }>
}) {
  const labels = getReportMessages(locale).printLabels

  return (
    <View style={styles.table}>
      <Text style={styles.diffSectionLabel}>{labels.metadataChanges}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { width: '30%' }]}>
          {labels.metadataField}
        </Text>
        <Text style={[styles.tableHeaderCell, { width: '35%' }]}>
          {labels.metadataPrevious}
        </Text>
        <Text style={[styles.tableHeaderCell, { width: '35%' }]}>
          {labels.metadataNew}
        </Text>
      </View>
      {section.changes.map((change, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static metadata rows
        <PdfMetadataChangeRow change={change} key={i} />
      ))}
    </View>
  )
}

function PdfMetadataChangeRow({ change }: { change: MetadataChange }) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.tableCellField]}>
        {change.field}
      </Text>
      <Text style={[styles.tableCell, styles.tableCellOld]}>
        {change.oldValue ?? '\u2014'}
      </Text>
      <Text style={[styles.tableCell, styles.tableCellNew]}>
        {change.newValue ?? '\u2014'}
      </Text>
    </View>
  )
}

function PdfTimelineEntry({
  locale,
  section,
}: {
  locale: string
  section: Extract<ReportSection, { type: 'timeline-entry' }>
}) {
  const { entry } = section
  const createdBy = formatActorDisplayNameForLocale(entry.createdBy, locale)

  return (
    <View style={styles.timelineEntry}>
      <View style={styles.timelineVersion}>
        <Text style={styles.timelineVersionNumber}>v{entry.versionNumber}</Text>
        <PdfBadge
          color={entry.status.color}
          iconName={entry.status.iconName}
          label={entry.status.label}
        />
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineMeta}>
          {createdBy ? `${createdBy} \u00B7 ` : ''}
          {formatTimelineDate(entry, locale)}
        </Text>
        {entry.descriptionExcerpt && (
          <Text style={styles.timelineExcerpt}>{entry.descriptionExcerpt}</Text>
        )}
      </View>
    </View>
  )
}

export function formatTimelineDate(
  entry: TimelineEntryData,
  locale: string,
): string {
  const labels = getReportMessages(locale).printLabels
  const parts: string[] = []
  if (entry.publishedAt)
    parts.push(
      `${labels.timelinePublished}: ${new Date(entry.publishedAt).toLocaleDateString(locale)}`,
    )
  if (entry.archivedAt)
    parts.push(
      `${labels.timelineArchived}: ${new Date(entry.archivedAt).toLocaleDateString(locale)}`,
    )
  if (entry.editedAt)
    parts.push(
      `${labels.timelineEdited}: ${new Date(entry.editedAt).toLocaleDateString(locale)}`,
    )
  if (parts.length === 0)
    parts.push(
      `${labels.timelineCreated}: ${new Date(entry.createdAt).toLocaleDateString(locale)}`,
    )
  return parts.join(' \u00B7 ')
}

function PdfRequirementTable({
  section,
}: {
  section: Extract<ReportSection, { type: 'requirement-table' }>
}) {
  const colWidths: Record<string, string> = {
    uniqueId: '14%',
    description: '50%',
    area: '20%',
    status: '16%',
  }
  const columnWidth = (key: string, width: string | undefined) =>
    width ?? colWidths[key] ?? '25%'

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {section.columns.map(col => (
          <Text
            key={col.key}
            style={[
              styles.tableHeaderCell,
              { width: columnWidth(col.key, col.width) },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>
      {section.rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static report rows
        <View key={i} style={styles.tableRow}>
          {section.columns.map(col => (
            <View
              key={col.key}
              style={{ width: columnWidth(col.key, col.width) }}
            >
              {col.key === 'status' && row.statusColor ? (
                <PdfBadge
                  color={row.statusColor}
                  iconName={row.statusIconName}
                  label={row.cells[col.key] ?? ''}
                />
              ) : (
                <Text style={styles.tableCell}>{row.cells[col.key] ?? ''}</Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function PdfTraceabilitySummary({
  section,
}: {
  section: Extract<ReportSection, { type: 'traceability-summary' }>
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
        {section.title}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {section.metrics.map(metric => (
          <View
            key={metric.label}
            style={{
              borderColor: '#e2e8f0',
              borderRadius: 4,
              borderWidth: 1,
              flex: 1,
              padding: 6,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 7 }}>
              {metric.label}
            </Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 15 }}>
              {metric.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {section.groups.map(group => (
          <View key={group.heading} style={{ flex: 1 }}>
            <Text
              style={{
                borderBottomColor: '#e2e8f0',
                borderBottomWidth: 1,
                color: '#334155',
                fontFamily: 'Helvetica-Bold',
                fontSize: 9,
                marginBottom: 4,
                paddingBottom: 3,
              }}
            >
              {group.heading}
            </Text>
            {group.items.map(item => (
              <View
                key={item.label}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 1,
                }}
              >
                <Text style={{ color: '#475569', fontSize: 8 }}>
                  {item.label}
                </Text>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function PdfTraceabilityTable({
  section,
}: {
  section: Extract<ReportSection, { type: 'traceability-table' }>
}) {
  return (
    <View>
      {section.rows.map(row => (
        <View
          key={`${row.origin}-${row.requirementId}`}
          style={{
            borderColor: '#e2e8f0',
            borderRadius: 4,
            borderWidth: 1,
            marginBottom: 7,
            padding: 7,
          }}
          wrap={false}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 5,
            }}
          >
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>
              {row.requirementId}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 8 }}>{row.origin}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            <PdfTraceabilityField
              label={section.labels.version}
              value={row.version}
            />
            <PdfTraceabilityField
              label={section.labels.area}
              value={row.area}
            />
            <PdfTraceabilityField
              label={section.labels.needsReference}
              value={row.needsReference}
            />
            <PdfTraceabilityField
              label={section.labels.usageStatus}
              value={row.usageStatus}
            />
            <PdfTraceabilityField
              label={section.labels.statusChangedAt}
              value={row.statusChangedAt}
            />
            <PdfTraceabilityField
              label={section.labels.deviation}
              value={row.deviation}
            />
            <PdfTraceabilityField
              label={section.labels.priorityLevel}
              value={row.priorityLevel}
            />
            <PdfTraceabilityField
              label={section.labels.verification}
              value={row.verification}
            />
            <PdfTraceabilityField
              label={section.labels.note}
              value={row.note}
              wide
            />
          </View>
        </View>
      ))}
    </View>
  )
}

function PdfTraceabilityField({
  label,
  value,
  wide = false,
}: {
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <View style={{ width: wide ? '100%' : '48%' }}>
      <Text
        style={{
          color: '#64748b',
          fontFamily: 'Helvetica-Bold',
          fontSize: 7,
          marginBottom: 1,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: value ? '#1e293b' : '#94a3b8', fontSize: 8 }}>
        {value || '—'}
      </Text>
    </View>
  )
}

function PdfToc({
  section,
}: {
  section: Extract<ReportSection, { type: 'toc' }>
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.tocTitle}>{section.title}</Text>
      {section.groups.map(group => (
        <View key={group.heading} style={{ marginBottom: 8 }}>
          <Text
            style={{
              fontSize: 8,
              fontFamily: 'Helvetica-Bold',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 3,
            }}
          >
            {group.heading}
          </Text>
          {group.items.map(item => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderBottomWidth: 0.5,
                borderBottomColor: '#d1d5db',
                borderBottomStyle: 'dotted',
                paddingBottom: 2,
                marginBottom: 2,
              }}
            >
              <Text style={styles.tocItem}>{item.label}</Text>
              <Text style={{ fontSize: 9, color: '#9ca3af' }}>{item.page}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function PdfStatusIcon({
  color = '#6b7280',
  name,
}: {
  color?: string
  name?: string | null
}) {
  const iconNodes = getStatusIconNodes(name)
  if (!iconNodes) return null

  return (
    <Svg
      fill="none"
      height={8}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={8}
    >
      {iconNodes.map(([tag, attrs], index) => {
        const key = `${name}-${tag}-${index}`
        switch (tag) {
          case 'circle':
            return (
              <Circle
                cx={attrs.cx}
                cy={attrs.cy}
                key={key}
                r={attrs.r ?? '0'}
              />
            )
          case 'ellipse':
            return (
              <Ellipse
                cx={attrs.cx ?? '0'}
                cy={attrs.cy ?? '0'}
                key={key}
                rx={attrs.rx ?? '0'}
                ry={attrs.ry ?? '0'}
              />
            )
          case 'line':
            return (
              <Line
                key={key}
                x1={attrs.x1 ?? '0'}
                x2={attrs.x2 ?? '0'}
                y1={attrs.y1 ?? '0'}
                y2={attrs.y2 ?? '0'}
              />
            )
          case 'rect':
            return (
              <Rect
                height={attrs.height ?? '0'}
                key={key}
                rx={attrs.rx}
                ry={attrs.ry}
                width={attrs.width ?? '0'}
                x={attrs.x}
                y={attrs.y}
              />
            )
          case 'polygon':
            return <Polygon key={key} points={attrs.points ?? ''} />
          case 'polyline':
            return <Polyline key={key} points={attrs.points ?? ''} />
          case 'path':
            return <Path d={attrs.d ?? ''} key={key} />
          default:
            return null
        }
      })}
    </Svg>
  )
}

function PdfBadge({
  label,
  color,
  iconName,
}: {
  label: string
  color: string | null
  iconName?: string | null
}) {
  const hex = color ?? '#6b7280'
  return (
    <View
      style={[
        styles.badge,
        {
          alignItems: 'center',
          backgroundColor: `${hex}20`,
          flexDirection: 'row',
          gap: 2,
          color: hex,
        },
      ]}
    >
      <PdfStatusIcon color={hex} name={iconName} />
      <Text>{label}</Text>
    </View>
  )
}

function PdfDeviationSummary({
  section,
}: {
  section: Extract<ReportSection, { type: 'deviation-summary' }>
}) {
  const locale = section.locale
  const labels = getReportLabels(locale)
  const priorityName = section.priorityLevel
    ? localizeReportValue(
        locale,
        section.priorityLevel.nameSv,
        section.priorityLevel.nameEn,
      )
    : null
  const createdBy = formatActorDisplayNameForLocale(section.createdBy, locale)
  return (
    <View
      style={{
        border: '2pt solid #f59e0b',
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        backgroundColor: '#fffbeb',
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 'bold',
          marginBottom: 8,
          color: '#92400e',
        }}
      >
        {labels.deviations.title}
      </Text>
      {priorityName && (
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: 2,
            marginBottom: 6,
          }}
        >
          <Text style={{ fontSize: 9, color: '#6b7280' }}>
            {labels.deviations.priorityLevel}
          </Text>
          <PdfStatusIcon
            color={section.priorityLevel?.color ?? '#6b7280'}
            name={section.priorityLevel?.iconName}
          />
          <Text style={{ fontSize: 9, color: '#6b7280' }}>{priorityName}</Text>
        </View>
      )}
      <Text
        style={{
          fontSize: 9,
          color: '#6b7280',
          marginBottom: 2,
        }}
      >
        {labels.deviations.motivation}
      </Text>
      <Text style={{ fontSize: 10, lineHeight: 1.6, marginBottom: 8 }}>
        {section.motivation}
      </Text>
      <View
        style={{
          borderTop: '1pt solid #fde68a',
          paddingTop: 4,
        }}
      >
        <Text style={{ fontSize: 8, color: '#6b7280' }}>
          {createdBy ? `${labels.deviations.submittedBy}: ${createdBy} · ` : ''}
          {new Date(section.createdAt).toLocaleDateString(locale)}
        </Text>
      </View>
    </View>
  )
}

function PdfSuggestionList({
  locale,
  section,
}: {
  locale: string
  section: Extract<ReportSection, { type: 'suggestion-list' }>
}) {
  if (section.items.length === 0) {
    return (
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 8, color: '#94a3b8', fontStyle: 'italic' }}>
          {section.emptyLabel}
        </Text>
      </View>
    )
  }

  return (
    <View style={{ marginBottom: 8 }}>
      {section.heading && (
        <Text
          style={{
            fontSize: 9,
            fontFamily: 'Helvetica-Bold',
            color: '#374151',
            marginBottom: 4,
          }}
        >
          {section.heading}
        </Text>
      )}
      {section.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static report items
        <PdfSuggestionCard item={item} key={i} locale={locale} />
      ))}
    </View>
  )
}

function PdfSuggestionCard({
  item,
  locale,
}: {
  item: SuggestionReportItem
  locale: string
}) {
  const isResolved = item.resolvedAt !== null
  const createdBy = formatActorDisplayNameForLocale(item.createdBy, locale)
  const resolvedBy = formatActorDisplayNameForLocale(item.resolvedBy, locale)
  const labels = getReportLabels(locale)

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: `${item.status.color}40`,
        borderLeftWidth: 2.5,
        borderLeftColor: item.status.color,
        borderRadius: 3,
        marginBottom: 4,
        padding: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginBottom: 3,
        }}
      >
        <PdfBadge color={item.status.color} label={item.status.label} />
        <Text style={{ fontSize: 7, color: '#6b7280' }}>
          {createdBy ? `${createdBy} \u00B7 ` : ''}
          {new Date(item.createdAt).toLocaleDateString(locale)}
        </Text>
      </View>
      <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.5 }}>
        {item.content}
      </Text>
      {isResolved && item.resolutionMotivation && (
        <View
          style={{
            marginTop: 4,
            paddingTop: 4,
            borderTopWidth: 0.5,
            borderTopColor: '#e2e8f0',
          }}
        >
          <Text
            style={{
              fontSize: 7,
              fontFamily: 'Helvetica-Bold',
              color: '#6b7280',
              marginBottom: 2,
            }}
          >
            {labels.deviations.motivation}
          </Text>
          <Text style={{ fontSize: 8, color: '#4b5563' }}>
            {item.resolutionMotivation}
          </Text>
          {(resolvedBy || item.resolvedAt) && (
            <Text style={{ fontSize: 7, color: '#6b7280', marginTop: 2 }}>
              {resolvedBy}
              {resolvedBy && item.resolvedAt && ' \u00B7 '}
              {item.resolvedAt &&
                new Date(item.resolvedAt).toLocaleDateString(locale)}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
