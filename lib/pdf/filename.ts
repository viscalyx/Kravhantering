const RESERVED_FILENAME_CHARS = /[/\\:*?"<>|]+/g

function removeControlChars(value: string): string {
  return Array.from(value)
    .filter(char => {
      const code = char.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
}

export function sanitizeAttachmentFilename(filename: string): string | null {
  const sanitized = removeControlChars(filename)
    .replace(RESERVED_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized.length > 0 ? sanitized : null
}

export function sanitizePdfFilename(filename: string): string {
  const sanitized = sanitizeAttachmentFilename(filename) ?? ''
  const withExtension = sanitized.toLowerCase().endsWith('.pdf')
    ? sanitized
    : `${sanitized}.pdf`

  return withExtension.length > 4 ? withExtension : 'report.pdf'
}

function escapeQuotedFilename(filename: string): string {
  return filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function asciiFallbackFilename(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[%/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  return fallback.length > 4 ? fallback : 'report.pdf'
}

export function pdfContentDisposition(filename: string): string {
  const sanitized = sanitizePdfFilename(filename)
  const asciiFallback = asciiFallbackFilename(sanitized)
  return `attachment; filename="${escapeQuotedFilename(
    asciiFallback,
  )}"; filename*=UTF-8''${encodeURIComponent(sanitized)}`
}

export function filenameFromContentDisposition(
  value: string | null,
): string | null {
  if (!value) return null

  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(value)
  if (encodedMatch?.[1]) {
    try {
      return sanitizeAttachmentFilename(decodeURIComponent(encodedMatch[1]))
    } catch {
      return null
    }
  }

  const quotedMatch = /filename="((?:\\"|[^"])*)"/i.exec(value)
  if (quotedMatch?.[1]) {
    return sanitizeAttachmentFilename(
      quotedMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    )
  }

  const bareMatch = /filename=([^;]+)/i.exec(value)
  return bareMatch?.[1] ? sanitizeAttachmentFilename(bareMatch[1].trim()) : null
}
