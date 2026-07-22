import {
  sanitizeAttachmentFilename,
  withRequiredAttachmentExtension,
} from '@/lib/attachment-filename'

export { sanitizeAttachmentFilename } from '@/lib/attachment-filename'

export function sanitizePdfFilename(filename: string): string {
  return withRequiredAttachmentExtension(filename, '.pdf', 'report.pdf')
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
