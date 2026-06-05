import { describe, expect, it } from 'vitest'
import { accessReviewExportFilename } from '@/lib/access-review/export-filenames'
import type { AccessReviewExportV1 } from '@/lib/access-review/types'
import { dataSubjectExportFilename } from '@/lib/privacy/data-subject-export-filenames'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

describe('localized export filenames', () => {
  it('uses ASCII-safe locale stems for access-review exports', () => {
    const payload = {
      generatedAt: '2026-05-12T12:30:00.000Z',
      run: { id: 42 },
    } as AccessReviewExportV1

    expect(accessReviewExportFilename(payload, 'json', 'en')).toBe(
      'access-review-0042-2026-05-12.json',
    )
    expect(accessReviewExportFilename(payload, 'pdf', 'sv')).toBe(
      'behorighetsoversyn-0042-2026-05-12.pdf',
    )
  })

  it('uses ASCII-safe locale stems for data-subject access exports', () => {
    const payload = {
      generatedAt: '2026-05-12T12:30:00.000Z',
      subject: { targetFingerprint: 'fingerprint-1234567890' },
    } as DataSubjectExportV1

    expect(dataSubjectExportFilename(payload, 'json', 'en')).toBe(
      'data-subject-access-export-fingerprint-1234-2026-05-12.json',
    )
    expect(dataSubjectExportFilename(payload, 'pdf', 'sv')).toBe(
      'personuppgiftsutdrag-fingerprint-1234-2026-05-12.pdf',
    )
  })
})
