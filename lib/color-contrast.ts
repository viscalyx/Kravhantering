/**
 * WCAG 2.1 contrast utilities.
 *
 * Used to validate and clamp DB-driven status colors before they are rendered
 * as text foreground on the badge background, ensuring WCAG 1.4.3 (Contrast
 * Minimum, Level AA) compliance.
 */

const FALLBACK_COLOR = '#111827'
const FALLBACK_COLOR_ON_DARK = '#f9fafb'
const DEFAULT_BG = '#ffffff'
/**
 * App dark-mode page background (`--color-secondary-900` in `app/globals.css`).
 * Used as the reference backdrop when picking a dark-mode-readable foreground.
 */
const DEFAULT_DARK_BG = '#0f172a'
const DEFAULT_MIN_RATIO = 4.5
const MAX_DARKEN_STEPS = 12
const DARKEN_STEP = 0.05

function normalizeHex(hex: string): string {
  let value = hex.trim().replace(/^#/, '')
  if (value.length === 3) {
    value = value
      .split('')
      .map(c => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return '000000'
  }
  return value.toLowerCase()
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const value = normalizeHex(hex)
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}

const toLinear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = (r: number, g: number, b: number): number => {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export const contrastRatio = (hex1: string, hex2: string): number => {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)
  const l1 = relativeLuminance(r1, g1, b1)
  const l2 = relativeLuminance(r2, g2, b2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const rgbToHsl = (
  r: number,
  g: number,
  b: number,
): [number, number, number] => {
  const rN = r / 255
  const gN = g / 255
  const bN = b / 255
  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rN) {
      h = (gN - bN) / d + (gN < bN ? 6 : 0)
    } else if (max === gN) {
      h = (bN - rN) / d + 2
    } else {
      h = (rN - gN) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}

const hueToRgbComponent = (p: number, q: number, t: number): number => {
  let tNorm = t
  if (tNorm < 0) tNorm += 1
  if (tNorm > 1) tNorm -= 1
  if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm
  if (tNorm < 1 / 2) return q
  if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6
  return p
}

const hslToHex = (h: number, s: number, l: number): string => {
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = l
    g = l
    b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hueToRgbComponent(p, q, h + 1 / 3)
    g = hueToRgbComponent(p, q, h)
    b = hueToRgbComponent(p, q, h - 1 / 3)
  }
  const toHex = (channel: number): string => {
    const hex = Math.round(channel * 255)
      .toString(16)
      .padStart(2, '0')
    return hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * If `fgHex` does not meet `minRatio` against `bgHex`, return a hue-preserving
 * darker variant. Falls back to `#111827` if darkening iterations fail.
 *
 * Implements WCAG 1.4.3 Contrast Minimum (Level AA, 4.5:1 default).
 *
 * NOTE: assumes a light backdrop. For dark-mode foregrounds use
 * `lightenForReadability` or `getReadableTextColors`.
 */
export const clampForReadability = (
  fgHex: string,
  bgHex: string = DEFAULT_BG,
  minRatio: number = DEFAULT_MIN_RATIO,
): string => {
  if (contrastRatio(fgHex, bgHex) >= minRatio) {
    return fgHex
  }
  const [r, g, b] = hexToRgb(fgHex)
  const [h, s, lInitial] = rgbToHsl(r, g, b)
  let l = lInitial
  for (let i = 0; i < MAX_DARKEN_STEPS; i++) {
    l = Math.max(0, l - DARKEN_STEP)
    const candidate = hslToHex(h, s, l)
    if (contrastRatio(candidate, bgHex) >= minRatio) {
      return candidate
    }
  }
  return FALLBACK_COLOR
}

/**
 * If `fgHex` does not meet `minRatio` against a dark `bgHex`, return a
 * hue-preserving lighter variant. Falls back to `#f9fafb` if lightening
 * iterations fail. Pair with `clampForReadability` to satisfy WCAG 1.4.3 in
 * both light and dark themes.
 */
export const lightenForReadability = (
  fgHex: string,
  bgHex: string = DEFAULT_DARK_BG,
  minRatio: number = DEFAULT_MIN_RATIO,
): string => {
  if (contrastRatio(fgHex, bgHex) >= minRatio) {
    return fgHex
  }
  const [r, g, b] = hexToRgb(fgHex)
  const [h, s, lInitial] = rgbToHsl(r, g, b)
  let l = lInitial
  for (let i = 0; i < MAX_DARKEN_STEPS; i++) {
    l = Math.min(1, l + DARKEN_STEP)
    const candidate = hslToHex(h, s, l)
    if (contrastRatio(candidate, bgHex) >= minRatio) {
      return candidate
    }
  }
  return FALLBACK_COLOR_ON_DARK
}

/**
 * Returns light- and dark-mode readable foreground colors for a DB-driven
 * status hex. The light variant is clamped against `#ffffff`; the dark variant
 * is lightened against the app dark page background. Use when a translucent
 * fill is rendered on top of either page background (badge pills, chips).
 */
export const getReadableTextColors = (
  fgHex: string,
): { dark: string; light: string } => ({
  light: clampForReadability(fgHex),
  dark: lightenForReadability(fgHex),
})

/**
 * Picks `#ffffff` or `#111827` — whichever has higher contrast against
 * `bgHex` — for use as text on a solid colored background. Use when text
 * sits on top of a non-translucent DB-driven color (e.g. the active step in
 * `StatusStepper`). Implements WCAG 1.4.3.
 */
export const pickReadableTextOn = (bgHex: string): string => {
  const onDark = contrastRatio('#ffffff', bgHex)
  const onLight = contrastRatio('#111827', bgHex)
  return onDark >= onLight ? '#ffffff' : '#111827'
}
