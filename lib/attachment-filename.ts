const UNSAFE_UNICODE_CHARS = /[\p{Cc}\p{Cf}\p{Cs}]/gu
const RESERVED_FILENAME_CHARS = /[/\\:*?"<>|]+/g
const UNSAFE_ASCII_FALLBACK_CHARS = /[%/\\:*?"<>|]+/g
const UTF8_ENCODER = new TextEncoder()

export const MAX_ATTACHMENT_FILENAME_UTF8_BYTES = 240

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength
}

function truncateMiddleToUtf8Bytes(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) return value

  const marker = '...'
  const markerBytes = utf8ByteLength(marker)

  const codePoints = Array.from(value)
  const prefix: string[] = []
  const suffix: string[] = []
  let byteCount = markerBytes
  let left = 0
  let right = codePoints.length - 1
  let takeFromStart = true

  while (left <= right) {
    const next = codePoints[takeFromStart ? left : right]
    const nextBytes = utf8ByteLength(next)
    if (byteCount + nextBytes > maxBytes) break

    if (takeFromStart) {
      prefix.push(next)
      left += 1
    } else {
      suffix.unshift(next)
      right -= 1
    }
    byteCount += nextBytes
    takeFromStart = !takeFromStart
  }

  return `${prefix.join('')}${marker}${suffix.join('')}`
}

export function sanitizeAttachmentFilename(filename: string): string | null {
  const sanitized = filename
    .normalize('NFC')
    .replace(UNSAFE_UNICODE_CHARS, '')
    .replace(RESERVED_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()

  if (sanitized.length === 0) return null
  return truncateMiddleToUtf8Bytes(
    sanitized,
    MAX_ATTACHMENT_FILENAME_UTF8_BYTES,
  )
}

function withoutRepeatedExtension(filename: string, extension: string): string {
  let stem = filename
  while (stem.toLowerCase().endsWith(extension)) {
    stem = stem.slice(0, -extension.length).trimEnd()
  }
  return stem
}

export function withRequiredAttachmentExtension(
  filename: string,
  extension: '.csv' | '.pdf',
  fallbackFilename: 'export.csv' | 'report.pdf',
): string {
  const sanitized = sanitizeAttachmentFilename(filename)
  const stem = sanitized ? withoutRepeatedExtension(sanitized, extension) : ''
  const fallbackStem = withoutRepeatedExtension(fallbackFilename, extension)
  const effectiveStem = stem.length > 0 ? stem : fallbackStem
  const stemBudget =
    MAX_ATTACHMENT_FILENAME_UTF8_BYTES - utf8ByteLength(extension)

  return `${truncateMiddleToUtf8Bytes(effectiveStem, stemBudget)}${extension}`
}

export function asciiAttachmentFilename(
  filename: string,
  fallbackFilename: 'export.csv' | 'report.pdf',
): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(UNSAFE_ASCII_FALLBACK_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim()

  return fallback.length > 0 ? fallback : fallbackFilename
}
