import { parse } from 'content-disposition'
import { describe, expect, it } from 'vitest'
import {
  csvContentDisposition,
  MAX_CONTENT_DISPOSITION_HEADER_UTF8_BYTES,
  pdfContentDisposition,
} from '@/lib/http/content-disposition'

const headerBytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength

describe('Content-Disposition helpers', () => {
  it('creates safe CSV attachment headers for reserved and Unicode characters', () => {
    const header = csvContentDisposition('RFI \\ question "list" å.csv')
    expect(header).toBe(
      'attachment; filename="RFI - question -list- _.csv"; filename*=UTF-8\'\'RFI%20-%20question%20-list-%20%C3%A5.csv',
    )
    expect(parse(header).parameters.filename).toBe(
      'RFI - question -list- å.csv',
    )
  })

  it('bounds CSV and PDF headers and uses stable empty-name fallbacks', () => {
    const csvHeader = csvContentDisposition(
      `${'%'.repeat(500)} ${'å'.repeat(500)}.csv`,
    )
    const pdfHeader = pdfContentDisposition('\u0000\u202e\ufeff')

    expect(headerBytes(csvHeader)).toBeLessThanOrEqual(
      MAX_CONTENT_DISPOSITION_HEADER_UTF8_BYTES,
    )
    expect(parse(csvHeader).parameters.filename).toMatch(/\.csv$/)
    expect(parse(pdfHeader).parameters.filename).toBe('report.pdf')
  })
})
