import { describe, expect, it } from 'vitest'
import { getClientIp, isValidClientIp } from '@/lib/auth/client-ip'

describe('getClientIp', () => {
  it('returns the first valid IPv4 candidate from X-Forwarded-For', () => {
    const request = new Request('https://app.example.test', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    })

    expect(getClientIp(request)).toBe('203.0.113.5')
  })

  it('returns the first valid IPv6 candidate from X-Forwarded-For', () => {
    const request = new Request('https://app.example.test', {
      headers: { 'x-forwarded-for': '2001:db8::1, 10.0.0.1' },
    })

    expect(getClientIp(request)).toBe('2001:db8::1')
  })

  it('skips malformed candidates and returns the next valid address', () => {
    const request = new Request('https://app.example.test', {
      headers: { 'x-forwarded-for': 'not-an-ip, 203.0.113.9' },
    })

    expect(getClientIp(request)).toBe('203.0.113.9')
  })

  it('returns undefined for missing, empty, or whitespace-only headers', () => {
    expect(getClientIp(new Request('https://app.example.test'))).toBeUndefined()
    expect(
      getClientIp(
        new Request('https://app.example.test', {
          headers: { 'x-forwarded-for': '' },
        }),
      ),
    ).toBeUndefined()
    expect(
      getClientIp(
        new Request('https://app.example.test', {
          headers: { 'x-forwarded-for': '   , \t ' },
        }),
      ),
    ).toBeUndefined()
  })
})

describe('isValidClientIp', () => {
  it('accepts conservative IPv4 and IPv6 addresses', () => {
    expect(isValidClientIp('203.0.113.5')).toBe(true)
    expect(isValidClientIp('2001:db8::1')).toBe(true)
    expect(isValidClientIp('::1')).toBe(true)
  })

  it('rejects malformed and injection-like values', () => {
    const rejected = [
      '203.0.113.5 10.0.0.1',
      '"203.0.113.5"',
      '<script>',
      '203.0.113.5\nX-Injected: yes',
      '203.0.113.5:443',
      '[2001:db8::1]:443',
      'example.test',
      '999.0.0.1',
      '2001:db8:::1',
    ]

    for (const value of rejected) {
      expect(isValidClientIp(value), value).toBe(false)
    }
  })
})
