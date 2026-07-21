import contentDisposition from 'content-disposition'

const RESERVED_FILENAME_CHARS = /[/\\:*?"<>|]+/g

export function csvContentDisposition(filename: string): string {
  const sanitized = filename
    .replace(RESERVED_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()
  const withExtension = sanitized.toLowerCase().endsWith('.csv')
    ? sanitized
    : `${sanitized}.csv`
  const fallback = withExtension.replace(/[^\x20-\x7e]/g, '_')

  return contentDisposition(withExtension, { fallback })
}
