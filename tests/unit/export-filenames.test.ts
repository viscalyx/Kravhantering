import { describe, expect, it } from 'vitest'
import { accessReviewExportFilename } from '@/lib/access-review/export-filenames'
import type { AccessReviewExportV1 } from '@/lib/access-review/types'
import { dataSubjectExportFilename } from '@/lib/privacy/data-subject-export-filenames'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

describe('localized export filenames', () => {
  it('creates deterministic fallback names for invalid timestamps', () => {
    const access = {
      generatedAt: 'not a date!',
      run: { id: 7 },
    } as AccessReviewExportV1
    expect(accessReviewExportFilename(access, 'json')).toBe(
      'access-review-0007-export.json',
    )
    access.generatedAt = '2026-05-xx trailing'
    expect(accessReviewExportFilename(access, 'pdf', 'sv')).toBe(
      'behorighetsoversyn-0007-2026-05-.pdf',
    )

    const privacy = {
      generatedAt: '!',
      subject: { targetFingerprint: '0123456789abcdef' },
    } as DataSubjectExportV1
    expect(dataSubjectExportFilename(privacy, 'json')).toBe(
      'data-subject-access-export-0123456789abcdef-export.json',
    )
  })

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
