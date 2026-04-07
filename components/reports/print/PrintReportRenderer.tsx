'use client'

import { useTranslations } from 'next-intl'
import type {
  DiffSegment,
  MetadataChange,
  ReportModel,
  ReportSection,
  TimelineEntryData,
  VersionSummaryData,
} from '@/lib/reports/types'
import './print-styles.css'

interface PrintReportRendererProps {
  locale: string
  model: ReportModel
}

export default function PrintReportRenderer({
  model,
  locale,
}: PrintReportRendererProps) {
  const t = useTranslations('reports')

  return (
    <div className="print-report-container">
      <div className="no-print" style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => globalThis.print()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#4338ca',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
          type="button"
        >
          {t('printButton')}
        </button>
      </div>
      {model.sections.map((section, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static report sections
        <SectionRenderer key={index} locale={locale} section={section} />
      ))}
    </div>
  )
}

function SectionRenderer({
  section,
  locale,
}: {
  section: ReportSection
  locale: string
}) {
  switch (section.type) {
    case 'header':
      return <HeaderSection locale={locale} section={section} />
    case 'notice':
      return <NoticeSection section={section} />
    case 'version-summary':
      return <VersionSummarySection locale={locale} section={section} />
    case 'diff':
      return <DiffSection section={section} />
    case 'metadata-changes':
      return <MetadataChangesSection section={section} />
    case 'timeline-entry':
      return <TimelineEntrySection locale={locale} section={section} />
    case 'package-cover':
      return <PackageCoverSection section={section} />
    case 'page-break':
      return <div className="print-page-break" />
    case 'requirement-table':
      return <RequirementTableSection section={section} />
    case 'toc':
      return <TocSection section={section} />
    case 'deviation-summary':
      return <DeviationSummarySection section={section} />
    default:
      return null
  }
}

function PackageCoverSection({
  section,
}: {
  section: Extract<ReportSection, { type: 'package-cover' }>
}) {
  const t = useTranslations('reports')
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h1
        style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1rem' }}
      >
        {section.name}
      </h1>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem 1.5rem',
        }}
      >
        <div>
          <dt
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748b',
              marginBottom: '0.25rem',
            }}
          >
            {t('packageCover.packageId')}
          </dt>
          <dd
            style={{ fontSize: '0.875rem', fontFamily: 'monospace', margin: 0 }}
          >
            {section.uniqueId}
          </dd>
        </div>
        <div>
          <dt
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748b',
              marginBottom: '0.25rem',
            }}
          >
            {t('packageCover.responsibilityArea')}
          </dt>
          <dd style={{ fontSize: '0.875rem', margin: 0 }}>
            {section.responsibilityArea ?? '—'}
          </dd>
        </div>
        <div>
          <dt
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748b',
              marginBottom: '0.25rem',
            }}
          >
            {t('packageCover.implementationType')}
          </dt>
          <dd style={{ fontSize: '0.875rem', margin: 0 }}>
            {section.implementationType ?? '—'}
          </dd>
        </div>
        <div>
          <dt
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#64748b',
              marginBottom: '0.25rem',
            }}
          >
            {t('packageCover.lifecycleStatus')}
          </dt>
          <dd style={{ fontSize: '0.875rem', margin: 0 }}>
            {section.lifecycleStatus ?? '—'}
          </dd>
        </div>
        {section.businessNeedsReference && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#64748b',
                marginBottom: '0.25rem',
              }}
            >
              {t('packageCover.businessNeedsReference')}
            </dt>
            <dd style={{ fontSize: '0.875rem', margin: 0 }}>
              {section.businessNeedsReference}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function HeaderSection({
  section,
  locale,
}: {
  section: Extract<ReportSection, { type: 'header' }>
  locale: string
}) {
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '1rem',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
        {section.title}
      </h1>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '0.5rem',
          color: '#64748b',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>{section.requirementId}</span>
        {section.subtitle && <span>{section.subtitle}</span>}
        {section.status && (
          <StatusBadge
            color={section.status.color}
            label={section.status.label}
          />
        )}
      </div>
      <div
        style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem' }}
      >
        {new Date(section.generatedAt).toLocaleString(locale)}
      </div>
    </div>
  )
}

function NoticeSection({
  section,
}: {
  section: Extract<ReportSection, { type: 'notice' }>
}) {
  const bgColor = section.severity === 'warning' ? '#fef3c7' : '#eff6ff'
  const borderColor = section.severity === 'warning' ? '#f59e0b' : '#3b82f6'
  const textColor = section.severity === 'warning' ? '#92400e' : '#1e40af'

  return (
    <div
      className="print-avoid-break"
      style={{
        backgroundColor: bgColor,
        borderLeft: `4px solid ${borderColor}`,
        color: textColor,
        fontSize: '0.875rem',
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        borderRadius: '0 0.25rem 0.25rem 0',
      }}
    >
      {section.message}
    </div>
  )
}

function VersionSummarySection({
  section,
  locale,
}: {
  section: Extract<ReportSection, { type: 'version-summary' }>
  locale: string
}) {
  const { version, label, isUnpublished, borderColor } = section
  const border = borderColor ?? (isUnpublished ? '#eab308' : '#22c55e')

  return (
    <div
      className="print-avoid-break"
      style={{
        border: `1px solid ${border}`,
        borderRadius: '0.5rem',
        marginBottom: '1rem',
        padding: '1rem',
      }}
    >
      {label && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            {label}
          </h3>
          <StatusBadge
            color={version.status.color}
            label={version.status.label}
          />
        </div>
      )}
      <VersionDetails locale={locale} version={version} />
    </div>
  )
}

function VersionDetails({
  version,
  locale,
}: {
  version: VersionSummaryData
  locale: string
}) {
  const getName = (item: { nameSv: string; nameEn: string } | null) => {
    if (!item) return null
    return locale === 'sv' ? item.nameSv : item.nameEn
  }

  return (
    <div style={{ fontSize: '0.875rem' }}>
      {version.description && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div
            style={{
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            {locale === 'sv' ? 'Beskrivning' : 'Description'}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#4b5563' }}>
            {version.description}
          </div>
        </div>
      )}
      {version.acceptanceCriteria && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div
            style={{
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            {locale === 'sv' ? 'Acceptanskriterier' : 'Acceptance Criteria'}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#4b5563' }}>
            {version.acceptanceCriteria}
          </div>
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
          color: '#6b7280',
          fontSize: '0.8125rem',
        }}
      >
        {getName(version.category) && (
          <MetadataItem
            label={locale === 'sv' ? 'Kategori' : 'Category'}
            value={getName(version.category)}
          />
        )}
        {getName(version.type) && (
          <MetadataItem
            label={locale === 'sv' ? 'Typ' : 'Type'}
            value={getName(version.type)}
          />
        )}
        {getName(version.qualityCharacteristic) && (
          <MetadataItem
            label={
              locale === 'sv' ? 'Kvalitetsegenskap' : 'Quality Characteristic'
            }
            value={getName(version.qualityCharacteristic)}
          />
        )}
        {getName(version.riskLevel) && (
          <MetadataItem
            label={locale === 'sv' ? 'Risknivå' : 'Risk Level'}
            value={getName(version.riskLevel)}
          />
        )}
        <MetadataItem
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
          <MetadataItem
            label={locale === 'sv' ? 'Skapad av' : 'Created By'}
            value={version.createdBy}
          />
        )}
      </div>
      {version.normReferences.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>
            {locale === 'sv' ? 'Referenser' : 'References'}:{' '}
          </span>
          <span style={{ color: '#6b7280' }}>
            {version.normReferences.map(r => r.name).join(', ')}
          </span>
        </div>
      )}
      {version.scenarios.length > 0 && (
        <div style={{ marginTop: '0.25rem' }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>
            {locale === 'sv' ? 'Scenarier' : 'Scenarios'}:{' '}
          </span>
          <span style={{ color: '#6b7280' }}>
            {version.scenarios
              .map(s => (locale === 'sv' ? s.nameSv : s.nameEn))
              .join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}

function MetadataItem({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  if (!value) return null
  return (
    <div>
      <span style={{ fontWeight: 500 }}>{label}: </span>
      <span>{value}</span>
    </div>
  )
}

function DiffSection({
  section,
}: {
  section: Extract<ReportSection, { type: 'diff' }>
}) {
  return (
    <div className="print-avoid-break" style={{ marginBottom: '1rem' }}>
      <h3
        style={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '0.5rem',
        }}
      >
        {section.fieldLabel}
      </h3>
      <div
        style={{
          padding: '0.75rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.375rem',
          border: '1px solid #e2e8f0',
          fontSize: '0.875rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {section.segments.map((segment, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff segments
          <DiffSegmentSpan key={i} segment={segment} />
        ))}
      </div>
    </div>
  )
}

function DiffSegmentSpan({ segment }: { segment: DiffSegment }) {
  if (segment.type === 'unchanged') {
    return <span>{segment.text}</span>
  }
  if (segment.type === 'added') {
    return (
      <span
        style={{
          backgroundColor: '#dcfce7',
          color: '#166534',
          textDecoration: 'underline',
          textDecorationColor: '#86efac',
        }}
      >
        {segment.text}
      </span>
    )
  }
  return (
    <span
      style={{
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        textDecoration: 'line-through',
        textDecorationColor: '#fca5a5',
      }}
    >
      {segment.text}
    </span>
  )
}

function MetadataChangesSection({
  section,
}: {
  section: Extract<ReportSection, { type: 'metadata-changes' }>
}) {
  return (
    <div className="print-avoid-break" style={{ marginBottom: '1rem' }}>
      <h3
        style={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '0.5rem',
        }}
      >
        Metadata Changes
      </h3>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.8125rem',
        }}
      >
        <thead>
          <tr>
            {['Field', 'Previous', 'New'].map(h => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '0.5rem',
                  borderBottom: '2px solid #e2e8f0',
                  color: '#64748b',
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.changes.map((change, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static metadata rows
            <MetadataChangeRow change={change} key={i} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MetadataChangeRow({ change }: { change: MetadataChange }) {
  return (
    <tr>
      <td
        style={{
          padding: '0.5rem',
          borderBottom: '1px solid #f1f5f9',
          fontWeight: 500,
        }}
      >
        {change.field}
      </td>
      <td
        style={{
          padding: '0.5rem',
          borderBottom: '1px solid #f1f5f9',
          color: '#991b1b',
          textDecoration: change.oldValue ? 'line-through' : undefined,
        }}
      >
        {change.oldValue ?? '—'}
      </td>
      <td
        style={{
          padding: '0.5rem',
          borderBottom: '1px solid #f1f5f9',
          color: '#166534',
        }}
      >
        {change.newValue ?? '—'}
      </td>
    </tr>
  )
}

function TimelineEntrySection({
  locale,
  section,
}: {
  locale: string
  section: Extract<ReportSection, { type: 'timeline-entry' }>
}) {
  const { entry } = section

  return (
    <div
      className="print-avoid-break"
      style={{
        display: 'flex',
        gap: '0.75rem',
        marginBottom: '0.75rem',
        paddingLeft: '0.5rem',
        borderLeft: '2px solid #e2e8f0',
      }}
    >
      <div style={{ minWidth: '3rem', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#334155' }}>
          v{entry.versionNumber}
        </div>
        <StatusBadge color={entry.status.color} label={entry.status.label} />
      </div>
      <div style={{ flex: 1, fontSize: '0.8125rem' }}>
        <div style={{ color: '#64748b' }}>
          {entry.createdBy && (
            <span style={{ fontWeight: 500 }}>{entry.createdBy} · </span>
          )}
          <TimelineDate entry={entry} locale={locale} />
        </div>
        {entry.descriptionExcerpt && (
          <div
            style={{
              color: '#4b5563',
              marginTop: '0.25rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {entry.descriptionExcerpt}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineDate({
  entry,
  locale,
}: {
  entry: TimelineEntryData
  locale: string
}) {
  const dates: string[] = []
  if (entry.publishedAt)
    dates.push(
      `Published: ${new Date(entry.publishedAt).toLocaleDateString(locale)}`,
    )
  if (entry.archivedAt)
    dates.push(
      `Archived: ${new Date(entry.archivedAt).toLocaleDateString(locale)}`,
    )
  if (entry.editedAt)
    dates.push(`Edited: ${new Date(entry.editedAt).toLocaleDateString(locale)}`)
  if (dates.length === 0)
    dates.push(
      `Created: ${new Date(entry.createdAt).toLocaleDateString(locale)}`,
    )
  return <span>{dates.join(' · ')}</span>
}

function TocSection({
  section,
}: {
  section: Extract<ReportSection, { type: 'toc' }>
}) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '0.75rem',
        }}
      >
        {section.title}
      </h3>
      {section.groups.map(group => (
        <div key={group.heading} style={{ marginBottom: '0.75rem' }}>
          <h4
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.375rem',
            }}
          >
            {group.heading}
          </h4>
          <ul
            style={{
              margin: 0,
              paddingLeft: '0',
              listStyle: 'none',
              fontSize: '0.875rem',
              color: '#4b5563',
            }}
          >
            {group.items.map(item => (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem',
                  paddingBottom: '0.25rem',
                  borderBottom: '1px dotted #d1d5db',
                }}
              >
                <span>{item.label}</span>
                <span style={{ color: '#9ca3af', flexShrink: 0 }}>
                  {item.page}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function RequirementTableSection({
  section,
}: {
  section: Extract<ReportSection, { type: 'requirement-table' }>
}) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.8125rem',
      }}
    >
      <thead>
        <tr>
          {section.columns.map(col => (
            <th
              key={col.key}
              style={{
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                borderBottom: '2px solid #e2e8f0',
                color: '#64748b',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {section.rows.map((row, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static report rows
          <tr key={i}>
            {section.columns.map(col => (
              <td
                key={col.key}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid #f1f5f9',
                  verticalAlign: 'top',
                  ...(col.key === 'description'
                    ? { maxWidth: '400px' }
                    : { whiteSpace: 'nowrap' }),
                }}
              >
                {col.key === 'status' && row.statusColor ? (
                  <StatusBadge
                    color={row.statusColor}
                    label={row.cells[col.key] ?? ''}
                  />
                ) : (
                  (row.cells[col.key] ?? '')
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatusBadge({
  label,
  color,
}: {
  label: string
  color: string | null
}) {
  const hex = color ?? '#6b7280'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.125rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 500,
        backgroundColor: `${hex}20`,
        color: hex,
      }}
    >
      {label}
    </span>
  )
}

function DeviationSummarySection({
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
    <div
      style={{
        border: '2px solid #f59e0b',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '1rem',
        backgroundColor: '#fffbeb',
      }}
    >
      <h3
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: '0.75rem',
          color: '#92400e',
        }}
      >
        {locale === 'sv' ? 'Avvikelse' : 'Deviation'}
      </h3>
      {riskName && (
        <div style={{ marginBottom: '0.75rem' }}>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: '#6b7280',
            }}
          >
            {locale === 'sv' ? 'Risknivå:' : 'Risk Level:'}
          </span>{' '}
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            {riskName}
          </span>
        </div>
      )}
      <div style={{ marginBottom: '0.75rem' }}>
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: '#6b7280',
            marginBottom: '0.25rem',
          }}
        >
          {locale === 'sv' ? 'Motivering:' : 'Motivation:'}
        </div>
        <div
          style={{
            fontSize: '0.875rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {section.motivation}
        </div>
      </div>
      <div
        style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          borderTop: '1px solid #fde68a',
          paddingTop: '0.5rem',
        }}
      >
        {section.createdBy && (
          <span>
            {locale === 'sv' ? 'Inlämnad av:' : 'Submitted by:'}{' '}
            {section.createdBy} ·{' '}
          </span>
        )}
        {new Date(section.createdAt).toLocaleDateString(locale)}
      </div>
    </div>
  )
}
