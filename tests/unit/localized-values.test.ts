import { describe, expect, it } from 'vitest'
import { isSwedish, localizedName } from '@/lib/i18n/localized'

describe('localized values', () => {
  it('selects the requested language and falls back through available names', () => {
    expect(isSwedish('sv')).toBe(true)
    expect(isSwedish('en')).toBe(false)
    expect(localizedName(undefined, 'sv')).toBe('')
    expect(localizedName({ nameEn: 'English', nameSv: 'Svenska' }, 'sv')).toBe(
      'Svenska',
    )
    expect(localizedName({ nameEn: 'English', nameSv: null }, 'sv')).toBe(
      'English',
    )
    expect(
      localizedName({ name: 'Generic', nameEn: '', nameSv: '' }, 'en'),
    ).toBe('Generic')
    expect(localizedName({ name: '', nameEn: null, nameSv: null }, null)).toBe(
      '',
    )
  })
})
