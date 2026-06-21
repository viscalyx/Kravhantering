import enMessages from '@/messages/en.json'
import svMessages from '@/messages/sv.json'

export type ReportLocale = 'en' | 'sv' | string
export type ReportMessages = typeof enMessages.reports
export type ReportLabels = typeof enMessages.reports.reportOutput

export function getReportMessages(locale: ReportLocale): ReportMessages {
  return locale === 'sv'
    ? (svMessages.reports as ReportMessages)
    : enMessages.reports
}

export function getReportLabels(locale: ReportLocale): ReportLabels {
  return getReportMessages(locale).reportOutput
}

export function formatReportBoolean(
  value: boolean,
  labels: ReportLabels,
): string {
  return value ? labels.common.yes : labels.common.no
}

export function formatRequirementCount(
  count: number,
  labels: ReportLabels,
): string {
  const noun =
    count === 1
      ? labels.common.requirementSingular
      : labels.common.requirementPlural
  return `${count} ${noun}`
}

export function formatReportTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key]
    return value == null ? match : String(value)
  })
}

export function localizeReportValue(
  locale: ReportLocale,
  sv: string | null,
  en: string | null,
): string {
  return (locale === 'sv' ? sv : en) ?? ''
}
