import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  filenameFromContentDisposition,
  sanitizeAttachmentFilename,
  sanitizePdfFilename,
} from '@/lib/pdf/filename'
import { renderPdfResponse } from '@/lib/pdf/server-response'

const pdfState = vi.hoisted(() => ({
  renderToBuffer: vi.fn(),
}))

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: pdfState.renderToBuffer,
}))

describe('PDF response helpers', () => {
  beforeEach(() => {
    pdfState.renderToBuffer.mockReset()
    pdfState.renderToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4'))
  })

  it('returns binary PDF responses with attachment and no-store headers', async () => {
    const response = await renderPdfResponse(
      createElement('mock-document'),
      'Granskning: <REQ-1>.pdf',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Disposition')).toContain('attachment')
    expect(response.headers.get('Content-Disposition')).toContain(
      'filename="Granskning- -REQ-1-.pdf"',
    )
    expect(await response.text()).toBe('%PDF-1.4')
  })

  it('sanitizes fallback filenames and parses RFC 5987 attachment filenames', () => {
    const filename = sanitizePdfFilename('\u0000../Risk:rapport?.pdf')
    expect(filename).toBe('..-Risk-rapport-.pdf')

    const disposition =
      'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'Granskning%20REQ-1.pdf'
    expect(filenameFromContentDisposition(disposition)).toBe(
      'Granskning REQ-1.pdf',
    )
  })

  it('removes Unicode spoofing controls from server and parsed filenames', async () => {
    const response = await renderPdfResponse(
      createElement('mock-document'),
      'Review\u202ePDF\u2066\u200b\ufeff.pdf',
    )
    const encodedFilename = encodeURIComponent(
      'Review\u202ePDF\u2066\u200b\ufeff.pdf',
    )
    const encodedDisposition = `attachment; filename="fallback.pdf"; filename*=UTF-8''${encodedFilename}`

    expect(response.headers.get('Content-Disposition')).toContain(
      'filename=ReviewPDF.pdf',
    )
    expect(filenameFromContentDisposition(encodedDisposition)).toBe(
      'ReviewPDF.pdf',
    )
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''%E0%A4%A.pdf",
      ),
    ).toBeNull()
  })

  it('bounds parsed attachment filenames before browser download use', () => {
    const encoded = encodeURIComponent(`Report ${'å'.repeat(200)} SPEC-123.csv`)
    const filename = filenameFromContentDisposition(
      `attachment; filename="fallback.csv"; filename*=UTF-8''${encoded}`,
    )

    expect(filename).not.toBeNull()
    expect(
      new TextEncoder().encode(filename ?? '').byteLength,
    ).toBeLessThanOrEqual(240)
    expect(filename).toContain('...')
    expect(filename).toMatch(/ SPEC-123\.csv$/)
  })

  it('preserves valid attachment extensions and sanitizes unsafe characters', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="kravbibliotek.csv"',
      ),
    ).toBe('kravbibliotek.csv')
    expect(
      filenameFromContentDisposition('attachment; filename="retry.csv"'),
    ).toBe('retry.csv')
    expect(
      filenameFromContentDisposition('attachment; filename=plain.csv'),
    ).toBe('plain.csv')
    expect(filenameFromContentDisposition('attachment')).toBeNull()
    expect(sanitizeAttachmentFilename('\u0000Risk:export?.csv')).toBe(
      'Risk-export-.csv',
    )
    expect(sanitizePdfFilename('Risk:rapport?')).toBe('Risk-rapport-.pdf')
  })
})
