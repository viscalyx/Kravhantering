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

function escapeCsvField(field: string): string {
  if (
    field.includes(';') ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r')
  ) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}
