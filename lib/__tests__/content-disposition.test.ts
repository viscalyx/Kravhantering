import { describe, expect, it } from 'vitest'
import { csvContentDisposition } from '@/lib/http/content-disposition'

describe('Content-Disposition helpers', () => {
  it('creates safe CSV attachment headers for reserved and Unicode characters', () => {
    expect(csvContentDisposition('RFI \\ question "list" å.csv')).toBe(
      'attachment; filename="RFI - question -list- _.csv"; filename*=UTF-8\'\'RFI%20-%20question%20-list-%20%C3%A5.csv',
    )
  })
})
