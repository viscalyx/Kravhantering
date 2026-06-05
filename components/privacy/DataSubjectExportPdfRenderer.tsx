import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  buildDataSubjectExportPdfModel,
  type DataSubjectExportPdfEntry,
  type DataSubjectExportPdfRow,
} from '@/lib/privacy/data-subject-export-pdf-presenter'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

export {
  buildDataSubjectExportPdfModel,
  formatDataSubjectRelatedObjectLabel,
} from '@/lib/privacy/data-subject-export-pdf-presenter'

interface ComponentProps {
  exportData: DataSubjectExportV1
  locale: string
}

const styles = StyleSheet.create({
  entry: {
    borderColor: '#e2e8f0',
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
    padding: 8,
  },
  entryDescription: {
    color: '#475569',
    marginBottom: 5,
  },
  entryTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 4,
  },
  intro: {
    color: '#334155',
    lineHeight: 1.35,
    marginBottom: 8,
  },
  limitation: {
    lineHeight: 1.35,
    marginBottom: 4,
  },
  meta: {
    color: '#64748b',
    marginBottom: 3,
  },
  page: {
    color: '#1e293b',
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 36,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 2,
  },
  section: {
    marginTop: 14,
  },
  sectionDescription: {
    color: '#64748b',
    lineHeight: 1.35,
    marginBottom: 7,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    marginBottom: 6,
  },
  value: {
    flex: 1,
  },
  valueLabel: {
    color: '#475569',
    fontFamily: 'Helvetica-Bold',
    width: 96,
  },
})

function MetadataRow({ label, value }: DataSubjectExportPdfRow) {
  return (
    <View style={styles.row}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

function entryKey(entry: DataSubjectExportPdfEntry): string {
  return `${entry.title}:${entry.rows
    .map(row => `${row.label}:${row.value}`)
    .join('|')}`
}

function ReportEntry({ entry }: { entry: DataSubjectExportPdfEntry }) {
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>{entry.title}</Text>
      <Text style={styles.entryDescription}>{entry.description}</Text>
      {entry.rows.map(row => (
        <MetadataRow key={`${row.label}:${row.value}`} {...row} />
      ))}
    </View>
  )
}

export default function DataSubjectExportPdfRenderer({
  exportData,
  locale,
}: ComponentProps) {
  const model = buildDataSubjectExportPdfModel(exportData, locale)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{model.title}</Text>
        <Text style={styles.intro}>{model.introduction}</Text>

        {model.metadataRows.map(row => (
          <MetadataRow key={row.label} {...row} />
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{model.summaryTitle}</Text>
          {model.summaryRows.map(row => (
            <MetadataRow key={row.label} {...row} />
          ))}
        </View>

        {model.sections.map(section => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionDescription}>{section.description}</Text>
            {section.entries.map(entry => (
              <ReportEntry entry={entry} key={entryKey(entry)} />
            ))}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{model.limitationTitle}</Text>
          {model.limitations.map(limitation => (
            <Text key={limitation} style={styles.limitation}>
              {limitation}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  )
}
