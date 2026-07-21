import { create as createContentDisposition } from 'content-disposition'
import {
  asciiAttachmentFilename,
  withRequiredAttachmentExtension,
} from '@/lib/attachment-filename'

const UTF8_ENCODER = new TextEncoder()

export const MAX_CONTENT_DISPOSITION_HEADER_UTF8_BYTES = 2048

function attachmentContentDisposition(
  filename: string,
  extension: '.csv' | '.pdf',
  fallbackFilename: 'export.csv' | 'report.pdf',
): string {
  const sanitized = withRequiredAttachmentExtension(
    filename,
    extension,
    fallbackFilename,
  )
  const fallback = asciiAttachmentFilename(sanitized, fallbackFilename)
  const header = createContentDisposition(sanitized, { fallback })

  if (
    UTF8_ENCODER.encode(header).byteLength <=
    MAX_CONTENT_DISPOSITION_HEADER_UTF8_BYTES
  ) {
    return header
  }

  return createContentDisposition(fallbackFilename)
}

export function csvContentDisposition(filename: string): string {
  return attachmentContentDisposition(filename, '.csv', 'export.csv')
}

export function pdfContentDisposition(filename: string): string {
  return attachmentContentDisposition(filename, '.pdf', 'report.pdf')
}
