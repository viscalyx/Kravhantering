import { describe, expect, it } from 'vitest'
import {
  clampLimit,
  getSpecificationServiceTitle,
  getVersionDisplayName,
  translateServiceMessage,
} from '@/lib/requirements/service-shared'

describe('requirements service shared utilities', () => {
  it('clamps invalid and out-of-range limits', () => {
    expect(clampLimit()).toBe(20)
    expect(clampLimit(Number.NaN)).toBe(20)
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(250)).toBe(200)
  })

  it('uses Swedish diacritics in fallback service labels', () => {
    expect(getVersionDisplayName(null, 'sv')).toBe('Okänd')
    expect(getSpecificationServiceTitle('remove', 'sv')).toBe(
      'Krav borttagna från kravunderlag',
    )
  })

  it('formats keyed specification service messages', () => {
    expect(
      translateServiceMessage(
        'sv',
        'requirements.specifications.summary.count',
        {
          count: 2,
          specificationWord: 'kravunderlag',
        },
      ),
    ).toBe('Hittade 2 kravunderlag.')
  })
})
