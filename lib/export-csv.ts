export function exportToCsv(
  headers: string[],
  rows: Record<string, string>[],
): string {
  const headerLine = headers.map(escapeCsvField).join(';')
  const dataLines = rows.map(row =>
    headers.map(h => escapeCsvField(row[h] ?? '')).join(';'),
  )
  return [headerLine, ...dataLines].join('\r\n')
}

const FORMULA_LEADING_CHARACTERS = ['=', '+', '-', '@', '\t', '\r'] as const

export function escapeCsvField(field: string): string {
  const isFormulaLeading = startsWithFormulaLeadingCharacter(field)
  const safeField = isFormulaLeading ? `'${field}` : field

  if (
    isFormulaLeading ||
    safeField.includes(';') ||
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
  return FORMULA_LEADING_CHARACTERS.some(character =>
    field.startsWith(character),
  )
}
