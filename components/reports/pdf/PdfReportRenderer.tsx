import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
  DiffSegment,
  MetadataChange,
  ReportModel,
  ReportSection,
  SuggestionReportItem,
  TimelineEntryData,
} from '@/lib/reports/types'
import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

type SpecificationCoverLabelKey =
  keyof typeof enMessages.reports.specificationCover

function getSpecificationCoverLabel(
  locale: string,
  key: SpecificationCoverLabelKey,
): string {
  const messages = locale === 'sv' ? svMessages : enMessages
  return messages.reports.specificationCover[key]
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
        // biome-ignore lint/suspicious/noArrayIndexKey: static report pages
        <Page key={pageIndex} size="A4" style={styles.page}>
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
      return <PdfMetadataChanges section={section} />
    case 'timeline-entry':
      return <PdfTimelineEntry locale={locale} section={section} />
    case 'requirement-table':
      return <PdfRequirementTable section={section} />
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
            {getSpecificationCoverLabel(section.locale, 'specificationId')}
          </Text>
          <Text style={[styles.fieldValue, { fontFamily: 'Helvetica-Bold' }]}>
            {section.uniqueId}
          </Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
            {getSpecificationCoverLabel(section.locale, 'responsibilityArea')}
          </Text>
          <Text style={styles.fieldValue}>
            {section.responsibilityArea ?? '—'}
          </Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={[styles.fieldLabel, { fontSize: 8 }]}>
            {getSpecificationCoverLabel(section.locale, 'implementationType')}
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
        {section.businessNeedsReference && (
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
          <PdfBadge color={section.status.color} label={section.status.label} />
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

  const getName = (item: { nameSv: string; nameEn: string } | null) => {
    if (!item) return null
    return locale === 'sv' ? item.nameSv : item.nameEn
  }

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
          <PdfBadge color={version.status.color} label={version.status.label} />
        </View>
      )}
      {version.description && (
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.fieldLabel}>
            {locale === 'sv' ? 'Beskrivning' : 'Description'}
          </Text>
          <Text style={styles.fieldValue}>{version.description}</Text>
        </View>
      )}
      {version.acceptanceCriteria && (
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.fieldLabel}>
            {locale === 'sv' ? 'Acceptanskriterier' : 'Acceptance Criteria'}
          </Text>
          <Text style={styles.fieldValue}>{version.acceptanceCriteria}</Text>
        </View>
      )}
      <View style={styles.metadataGrid}>
        {getName(version.category) && (
          <PdfMetadataItem
            label={locale === 'sv' ? 'Kategori' : 'Category'}
            value={getName(version.category)}
          />
        )}
        {getName(version.type) && (
          <PdfMetadataItem
            label={locale === 'sv' ? 'Typ' : 'Type'}
            value={getName(version.type)}
          />
        )}
        {getName(version.qualityCharacteristic) && (
          <PdfMetadataItem
            label={
              locale === 'sv' ? 'Kvalitetsegenskap' : 'Quality Characteristic'
            }
            value={getName(version.qualityCharacteristic)}
          />
        )}
        <PdfMetadataItem
          label={locale === 'sv' ? 'Kräver testning' : 'Requires Testing'}
          value={
            version.requiresTesting
              ? locale === 'sv'
                ? 'Ja'
                : 'Yes'
              : locale === 'sv'
                ? 'Nej'
                : 'No'
          }
        />
        {version.createdBy && (
          <PdfMetadataItem
            label={locale === 'sv' ? 'Skapad av' : 'Created By'}
            value={version.createdBy}
          />
        )}
      </View>
      {version.normReferences.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 8, color: '#6b7280' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#374151' }}>
              {locale === 'sv' ? 'Referenser: ' : 'References: '}
            </Text>
            {version.normReferences.map(r => r.name).join(', ')}
          </Text>
        </View>
      )}
      {version.requirementPackages.length > 0 && (
        <View style={{ marginTop: 2 }}>
          <Text style={{ fontSize: 8, color: '#6b7280' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#374151' }}>
              {locale === 'sv' ? 'Kravpaket: ' : 'Requirements packages: '}
            </Text>
            {version.requirementPackages
              .map(s => (locale === 'sv' ? s.nameSv : s.nameEn))
              .join(', ')}
          </Text>
        </View>
      )}
    </View>
  )
}

function PdfMetadataItem({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  if (!value) return null
  return (
    <Text style={styles.metadataItem}>
      <Text style={styles.metadataItemLabel}>{label}: </Text>
      {value}
    </Text>
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
  section,
}: {
  section: Extract<ReportSection, { type: 'metadata-changes' }>
}) {
  return (
    <View style={styles.table}>
      <Text style={styles.diffSectionLabel}>Metadata Changes</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { width: '30%' }]}>Field</Text>
        <Text style={[styles.tableHeaderCell, { width: '35%' }]}>Previous</Text>
        <Text style={[styles.tableHeaderCell, { width: '35%' }]}>New</Text>
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

  return (
    <View style={styles.timelineEntry}>
      <View style={styles.timelineVersion}>
        <Text style={styles.timelineVersionNumber}>v{entry.versionNumber}</Text>
        <PdfBadge color={entry.status.color} label={entry.status.label} />
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineMeta}>
          {entry.createdBy ? `${entry.createdBy} \u00B7 ` : ''}
          {formatTimelineDate(entry, locale)}
        </Text>
        {entry.descriptionExcerpt && (
          <Text style={styles.timelineExcerpt}>{entry.descriptionExcerpt}</Text>
        )}
      </View>
    </View>
  )
}

function formatTimelineDate(entry: TimelineEntryData, locale: string): string {
  const parts: string[] = []
  if (entry.publishedAt)
    parts.push(
      `Published: ${new Date(entry.publishedAt).toLocaleDateString(locale)}`,
    )
  if (entry.archivedAt)
    parts.push(
      `Archived: ${new Date(entry.archivedAt).toLocaleDateString(locale)}`,
    )
  if (entry.editedAt)
    parts.push(`Edited: ${new Date(entry.editedAt).toLocaleDateString(locale)}`)
  if (parts.length === 0)
    parts.push(
      `Created: ${new Date(entry.createdAt).toLocaleDateString(locale)}`,
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

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {section.columns.map(col => (
          <Text
            key={col.key}
            style={[
              styles.tableHeaderCell,
              { width: colWidths[col.key] ?? '25%' },
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
            <View key={col.key} style={{ width: colWidths[col.key] ?? '25%' }}>
              {col.key === 'status' && row.statusColor ? (
                <PdfBadge
                  color={row.statusColor}
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

function PdfBadge({ label, color }: { label: string; color: string | null }) {
  const hex = color ?? '#6b7280'
  return (
    <Text
      style={[
        styles.badge,
        {
          backgroundColor: `${hex}20`,
          color: hex,
        },
      ]}
    >
      {label}
    </Text>
  )
}

function PdfDeviationSummary({
  section,
}: {
  section: Extract<ReportSection, { type: 'deviation-summary' }>
}) {
  const locale = section.locale
  const riskName = section.riskLevel
    ? locale === 'sv'
      ? section.riskLevel.nameSv
      : section.riskLevel.nameEn
    : null
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
        {locale === 'sv' ? 'Avvikelse' : 'Deviation'}
      </Text>
      {riskName && (
        <Text style={{ fontSize: 9, marginBottom: 6, color: '#6b7280' }}>
          {locale === 'sv' ? 'Risknivå:' : 'Risk Level:'} {riskName}
        </Text>
      )}
      <Text
        style={{
          fontSize: 9,
          color: '#6b7280',
          marginBottom: 2,
        }}
      >
        {locale === 'sv' ? 'Motivering:' : 'Motivation:'}
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
          {section.createdBy
            ? `${locale === 'sv' ? 'Inlämnad av' : 'Submitted by'}: ${section.createdBy} · `
            : ''}
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
          {item.createdBy ? `${item.createdBy} \u00B7 ` : ''}
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
            {locale === 'sv' ? 'Motivering:' : 'Motivation:'}
          </Text>
          <Text style={{ fontSize: 8, color: '#4b5563' }}>
            {item.resolutionMotivation}
          </Text>
          {(item.resolvedBy || item.resolvedAt) && (
            <Text style={{ fontSize: 7, color: '#6b7280', marginTop: 2 }}>
              {item.resolvedBy}
              {item.resolvedBy && item.resolvedAt && ' \u00B7 '}
              {item.resolvedAt &&
                new Date(item.resolvedAt).toLocaleDateString(locale)}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
