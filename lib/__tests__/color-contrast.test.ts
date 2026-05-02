import { describe, expect, it } from 'vitest'
import {
  clampForReadability,
  contrastRatio,
  getReadableTextColors,
  hexToRgb,
  lightenForReadability,
  pickReadableTextOn,
  relativeLuminance,
} from '@/lib/color-contrast'

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#ff8800')).toEqual([255, 136, 0])
  })

  it('parses 3-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#f80')).toEqual([255, 136, 0])
  })

  it('handles missing # prefix', () => {
    expect(hexToRgb('ffffff')).toEqual([255, 255, 255])
  })

  it('returns black for invalid input', () => {
    expect(hexToRgb('not a color')).toEqual([0, 0, 0])
  })
})

describe('relativeLuminance', () => {
  it('returns 1 for white and 0 for black', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 4)
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 4)
  })
})

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 4)
  })

  it('is symmetric', () => {
    const a = contrastRatio('#3b82f6', '#ffffff')
    const b = contrastRatio('#ffffff', '#3b82f6')
    expect(a).toBeCloseTo(b, 4)
  })
})

describe('clampForReadability', () => {
  it('returns the original color when contrast is sufficient', () => {
    expect(clampForReadability('#000000', '#ffffff')).toBe('#000000')
    expect(clampForReadability('#1f2937', '#ffffff')).toBe('#1f2937')
  })

  it('darkens a low-contrast color until it passes 4.5:1', () => {
    const result = clampForReadability('#cccccc', '#ffffff')
    expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens medium gray to a passing variant', () => {
    const result = clampForReadability('#6b7280', '#ffffff')
    expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('preserves hue when darkening', () => {
    const result = clampForReadability('#ffcccc', '#ffffff')
    const [r, g, b] = hexToRgb(result)
    // Red channel should remain the dominant component
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('falls back to #111827 when all darkening attempts fail', () => {
    // White on white can never reach 4.5:1 by darkening lightness alone
    // ... actually it can. But white-on-white WILL be clamped to fallback only
    // if hue/saturation are zero and we cannot reach the threshold within 10 steps.
    // Use a contrived high min-ratio to force the fallback path.
    const result = clampForReadability('#ffffff', '#ffffff', 21.5)
    expect(result).toBe('#111827')
  })

  it('respects custom background and min ratio', () => {
    const result = clampForReadability('#888888', '#000000', 4.5)
    // Already passes against black, so returned unchanged
    expect(result).toBe('#888888')
  })
})

describe('lightenForReadability', () => {
  it('returns the original color when contrast is sufficient on dark bg', () => {
    expect(lightenForReadability('#ffffff', '#0f172a')).toBe('#ffffff')
  })

  it('lightens a low-contrast color until it passes 4.5:1 on dark navy', () => {
    // Dark blue on dark navy fails 4.5:1; should be lightened.
    const result = lightenForReadability('#1e40af', '#0f172a')
    expect(contrastRatio(result, '#0f172a')).toBeGreaterThanOrEqual(4.5)
  })

  it('preserves hue when lightening', () => {
    const result = lightenForReadability('#1e3a8a', '#0f172a')
    const [r, g, b] = hexToRgb(result)
    // Blue channel should remain dominant
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })

  it('falls back to #f9fafb when all lightening attempts fail', () => {
    const result = lightenForReadability('#000000', '#000000', 21.5)
    expect(result).toBe('#f9fafb')
  })
})

describe('getReadableTextColors', () => {
  it('returns both light- and dark-mode foregrounds', () => {
    const { light, dark } = getReadableTextColors('#3b82f6')
    expect(contrastRatio(light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(dark, '#0f172a')).toBeGreaterThanOrEqual(4.5)
  })

  it('produces a darker light-variant and lighter dark-variant for mid-tones', () => {
    // For a mid-tone color, the light variant should be darker than the dark
    // variant (which is lifted toward white for legibility on dark navy).
    const { light, dark } = getReadableTextColors('#3b82f6')
    const lLight = relativeLuminance(...hexToRgb(light))
    const lDark = relativeLuminance(...hexToRgb(dark))
    expect(lDark).toBeGreaterThan(lLight)
  })
})

describe('pickReadableTextOn', () => {
  it('picks white text on a dark saturated blue', () => {
    // #1e40af luminance is low; white wins.
    expect(pickReadableTextOn('#1e40af')).toBe('#ffffff')
  })

  it('picks dark text on bright yellow', () => {
    expect(pickReadableTextOn('#eab308')).toBe('#111827')
  })

  it('picks white on near-black backgrounds', () => {
    expect(pickReadableTextOn('#000000')).toBe('#ffffff')
  })

  it('picks dark on near-white backgrounds', () => {
    expect(pickReadableTextOn('#ffffff')).toBe('#111827')
  })
})
