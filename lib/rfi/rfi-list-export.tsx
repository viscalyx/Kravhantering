import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
  RfiRelevance,
  SpecificationRfiListRow,
} from '@/lib/dal/rfi-questions'
import { exportToCsv } from '@/lib/export-csv'

export interface RfiListSpecificationExportMeta {
  name: string
  uniqueId: string
}

const labels = {
  en: {
    area: 'Requirement area',
    expectedAnswerFormat: 'Expected answer format',
    excluded: 'Excluded',
    helpText: 'Purpose/help text',
    included: 'Included',
    locked: 'Locked',
    mode: 'Mode',
    no: 'No',
    notLocked: 'Preparation',
    notRelevant: 'Not relevant',
    question: 'Question',
    questionCode: 'RFI question',
    relevance: 'Relevance',
    relevant: 'Relevant',
    scope: 'Scope',
    title: 'RFI question list',
    unassessed: 'Not assessed',
    version: 'Version',
    yes: 'Yes',
  },
  sv: {
    area: 'Kravområde',
    expectedAnswerFormat: 'Önskat svarsformat',
    excluded: 'Utesluten',
    helpText: 'Syfte/hjälptext',
    included: 'Med',
    locked: 'Låst',
    mode: 'Läge',
    no: 'Nej',
    notLocked: 'Förbered',
    notRelevant: 'Inte relevant',
    question: 'Fråga',
    questionCode: 'RFI-fråga',
    relevance: 'Relevans',
    relevant: 'Relevant',
    scope: 'Scope',
    title: 'RFI-frågelista',
    unassessed: 'Ej bedömd',
    version: 'Version',
    yes: 'Ja',
  },
} as const

const styles = StyleSheet.create({
  areaTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 5,
  },
  item: {
    borderColor: '#e2e8f0',
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 7,
    padding: 8,
  },
  itemMeta: {
    color: '#64748b',
    marginBottom: 4,
  },
  itemTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
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
  questionText: {
    lineHeight: 1.35,
    marginBottom: 5,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 2,
  },
  section: {
    marginTop: 14,
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

function localeLabels(locale: string) {
  return locale === 'en' ? labels.en : labels.sv
}

function relevanceLabel(
  relevance: RfiRelevance | null,
  locale: string,
): string {
  const t = localeLabels(locale)
  if (relevance === 'relevant') return t.relevant
  if (relevance === 'not_relevant') return t.notRelevant
  return t.unassessed
}

function scopeLabel(isIncluded: boolean, locale: string): string {
  const t = localeLabels(locale)
  return isIncluded ? t.included : t.excluded
}

function groupByArea(list: SpecificationRfiListRow) {
  const groups = new Map<string, SpecificationRfiListRow['items']>()
  for (const item of list.items) {
    const key = item.areaName
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }
  return Array.from(groups.entries())
}

export function buildSpecificationRfiListCsv(
  specification: RfiListSpecificationExportMeta,
  list: SpecificationRfiListRow,
  locale: string,
): string {
  const t = localeLabels(locale)
  const headers = [
    t.questionCode,
    t.version,
    t.area,
    t.scope,
    t.relevance,
    t.question,
    t.helpText,
    t.expectedAnswerFormat,
  ]
  return exportToCsv(
    headers,
    list.items.map(item => ({
      [t.area]: item.areaName,
      [t.expectedAnswerFormat]: item.expectedAnswerFormat ?? '',
      [t.helpText]: item.helpText ?? '',
      [t.question]: item.questionText,
      [t.questionCode]: item.questionCode,
      [t.relevance]: relevanceLabel(item.relevance, locale),
      [t.scope]: scopeLabel(item.isIncluded, locale),
      [t.version]: String(item.versionNumber),
      specification: `${specification.name} ${specification.uniqueId}`,
    })),
  )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

export default function SpecificationRfiListPdfRenderer({
  list,
  locale,
  specification,
}: {
  list: SpecificationRfiListRow
  locale: string
  specification: RfiListSpecificationExportMeta
}) {
  const t = localeLabels(locale)
  const groups = groupByArea(list)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.meta}>
          {specification.name} ({specification.uniqueId})
        </Text>
        <MetadataRow
          label={t.mode}
          value={list.isLocked ? t.locked : t.notLocked}
        />
        {list.lockedAt ? (
          <MetadataRow label={t.locked} value={list.lockedAt} />
        ) : null}

        {groups.map(([areaName, items]) => (
          <View key={areaName} style={styles.section}>
            <Text style={styles.areaTitle}>{areaName}</Text>
            {items.map(item => (
              <View key={item.questionId} style={styles.item}>
                <Text style={styles.itemTitle}>
                  {item.questionCode} v{item.versionNumber}
                </Text>
                <Text style={styles.itemMeta}>
                  {t.scope}: {scopeLabel(item.isIncluded, locale)} |{' '}
                  {t.relevance}: {relevanceLabel(item.relevance, locale)}
                </Text>
                <Text style={styles.questionText}>{item.questionText}</Text>
                {item.helpText ? (
                  <MetadataRow label={t.helpText} value={item.helpText} />
                ) : null}
                {item.expectedAnswerFormat ? (
                  <MetadataRow
                    label={t.expectedAnswerFormat}
                    value={item.expectedAnswerFormat}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  )
}
