export function exportToCsv(
  headers: string[],
  rows: Record<string, string>[],
): string {
  const headerLine = headers.map(header => escapeCsvField(header)).join(';')
  const dataLines = rows.map(row =>
    headers.map(h => escapeCsvField(row[h] ?? '')).join(';'),
  )
  return [headerLine, ...dataLines].join('\r\n')
}

const FORMULA_LEADING_PATTERN = /^(?:[\t\r]|[ \t\r]*[-=+@])/

export interface CsvFieldEncodingOptions {
  delimiter?: string
  quoteAll?: boolean
}

export function escapeCsvField(
  field: string,
  options: CsvFieldEncodingOptions = {},
): string {
  const { delimiter = ';', quoteAll = false } = options
  const isFormulaLeading = startsWithFormulaLeadingCharacter(field)
  const safeField = isFormulaLeading ? `'${field}` : field

  if (
    quoteAll ||
    isFormulaLeading ||
    safeField.includes(delimiter) ||
    safeField.includes('"') ||
    safeField.includes('\t') ||
    safeField.includes('\n') ||
    safeField.includes('\r')
  ) {
    return `"${safeField.replace(/"/g, '""')}"`
  }
  return safeField
}

function startsWithFormulaLeadingCharacter(field: string): boolean {
  return FORMULA_LEADING_PATTERN.test(field)
}
