import { describe, expect, it } from 'vitest'
import {
  asciiAttachmentFilename,
  MAX_ATTACHMENT_FILENAME_UTF8_BYTES,
  sanitizeAttachmentFilename,
  withRequiredAttachmentExtension,
} from '@/lib/attachment-filename'

const utf8Bytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength

describe('attachment filename policy', () => {
  it('normalizes Unicode and removes control, format, and reserved characters', () => {
    expect(
      sanitizeAttachmentFilename(
        '  A\u0000B\u007fC\u0085D\u202eE\u2066F\u200bG\ufeffH\u00adI\ud800J e\u0301 /\\:*?"<>|  å  ',
      ),
    ).toBe('ABCDEFGHIJ é - å')
    expect(sanitizeAttachmentFilename('\u0000\u202e\ufeff')).toBeNull()
  })

  it('enforces one required extension and stable empty-name fallbacks', () => {
    expect(
      withRequiredAttachmentExtension(
        'requirements.CSV.csv',
        '.csv',
        'export.csv',
      ),
    ).toBe('requirements.csv')
    expect(withRequiredAttachmentExtension('.csv', '.csv', 'export.csv')).toBe(
      'export.csv',
    )
    expect(
      withRequiredAttachmentExtension('\u0000', '.pdf', 'report.pdf'),
    ).toBe('report.pdf')
  })

  it('keeps exact-limit filenames and middle-truncates over-limit Unicode', () => {
    const exact = `${'a'.repeat(236)}.csv`
    expect(withRequiredAttachmentExtension(exact, '.csv', 'export.csv')).toBe(
      exact,
    )

    const truncated = withRequiredAttachmentExtension(
      `Report ${'å'.repeat(200)} SPEC-123.csv`,
      '.csv',
      'export.csv',
    )
    expect(utf8Bytes(truncated)).toBeLessThanOrEqual(
      MAX_ATTACHMENT_FILENAME_UTF8_BYTES,
    )
    expect(truncated).toMatch(/^Report /)
    expect(truncated).toContain('...')
    expect(truncated).toMatch(/ SPEC-123\.csv$/)
    expect(truncated).not.toContain('\ufffd')
  })

  it('creates an unambiguous ASCII fallback', () => {
    expect(asciiAttachmentFilename('Å 100% report.csv', 'export.csv')).toBe(
      '_ 100- report.csv',
    )
    expect(asciiAttachmentFilename('', 'report.pdf')).toBe('report.pdf')
  })
})
