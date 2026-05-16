const MAX_IP_LENGTH = 45
const FORBIDDEN_IP_CHARACTERS = new Set([
  '"',
  "'",
  '<',
  '>',
  '`',
  '\\',
  '[',
  ']',
])
const IPV4_OCTET = /^(?:0|[1-9]\d{0,2})$/u
const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/u

function hasForbiddenIpCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      character.trim() === '' ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      FORBIDDEN_IP_CHARACTERS.has(character)
    ) {
      return true
    }
  }
  return false
}

function isValidIpv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every(part => {
    if (!IPV4_OCTET.test(part)) return false
    return Number(part) <= 255
  })
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(':')) return false
  if (!/^[0-9A-Fa-f:]+$/u.test(value)) return false
  if (value === ':' || value.includes(':::')) return false

  const doubleColonCount = value.match(/::/gu)?.length ?? 0
  if (doubleColonCount > 1) return false

  const hasCompressedZeroes = doubleColonCount === 1
  if (!hasCompressedZeroes && (value.startsWith(':') || value.endsWith(':'))) {
    return false
  }

  const groups = value.split(':').filter(Boolean)
  if (groups.some(group => !IPV6_GROUP.test(group))) return false

  return hasCompressedZeroes ? groups.length < 8 : groups.length === 8
}

export function isValidClientIp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > MAX_IP_LENGTH) return false
  if (hasForbiddenIpCharacter(value)) return false
  return isValidIpv4(value) || isValidIpv6(value)
}

export function getClientIp(request: Request): string | undefined {
  let forwardedFor: string | null = null
  try {
    forwardedFor = request.headers.get('x-forwarded-for')
  } catch {
    return undefined
  }
  if (!forwardedFor) return undefined

  for (const entry of forwardedFor.split(',')) {
    const candidate = entry.trim()
    if (!candidate) continue
    if (isValidClientIp(candidate)) return candidate
  }
  return undefined
}
