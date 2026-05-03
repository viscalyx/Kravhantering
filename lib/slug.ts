const SWEDISH_MAP: Record<string, string> = {
  å: 'A',
  Å: 'A',
  ä: 'A',
  Ä: 'A',
  ö: 'O',
  Ö: 'O',
  é: 'E',
  É: 'E',
  ü: 'U',
  Ü: 'U',
}

const STOP_WORDS = new Set([
  'AV',
  'ATT',
  'DE',
  'DEN',
  'DET',
  'EN',
  'ETT',
  'FOR',
  'I',
  'MED',
  'OCH',
  'SOM',
  'TILL',
])

function transliterate(str: string): string {
  return str
    .split('')
    .map(ch => SWEDISH_MAP[ch] ?? ch)
    .join('')
}

/**
 * Generate a URL-safe uppercase slug from a Swedish specification name.
 * Max 20 characters. Example: "Säkerhetslyft Q2" → "SAKERHETSLYFT-Q2"
 */
export function generateSpecificationSlug(nameSv: string): string {
  const upper = transliterate(nameSv).toUpperCase()

  // Replace non-alphanumeric (except spaces) with space, then split into words
  const words = upper
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !STOP_WORDS.has(w))

  if (words.length === 0) return ''

  const joined = words.join('-')

  if (joined.length <= 20) return joined

  // Truncate at hyphen boundary
  const truncated = joined.slice(0, 20)
  const lastHyphen = truncated.lastIndexOf('-')
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated
}

/**
 * Normalise raw user input into a valid slug:
 * uppercase, replace invalid chars with hyphen, collapse hyphens, trim.
 */
export function normalizeSlugInput(raw: string): string {
  return transliterate(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
}
