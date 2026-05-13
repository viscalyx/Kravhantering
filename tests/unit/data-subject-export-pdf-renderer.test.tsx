import { describe, expect, it } from 'vitest'
import { formatDataSubjectRelatedObjectLabel } from '@/components/privacy/DataSubjectExportPdfRenderer'

describe('DataSubjectExportPdfRenderer', () => {
  it('formats access review related objects with localized labels', () => {
    expect(
      formatDataSubjectRelatedObjectLabel(
        {
          key: '42',
          label: 'access_review:42',
          type: 'access_review_run',
        },
        'sv',
      ),
    ).toBe('Behörighetsöversyn 42')
    expect(
      formatDataSubjectRelatedObjectLabel(
        {
          key: '42:7',
          label: 'access_review_item:42:7',
          type: 'access_review_item',
        },
        'en',
      ),
    ).toBe('Access review row 42:7')
  })

  it('keeps existing labels for other related object types', () => {
    expect(
      formatDataSubjectRelatedObjectLabel(
        { key: '7', label: 'Kalle Svensson', type: 'owner' },
        'sv',
      ),
    ).toBe('Kalle Svensson')
  })
})
