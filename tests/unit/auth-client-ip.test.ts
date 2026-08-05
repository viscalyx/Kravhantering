import { describe, expect, it } from 'vitest'
import { getClientIp, isValidClientIp } from '@/lib/auth/client-ip'

describe('client IP validation', () => {
  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '2001:db8:0:0:0:0:0:1',
    '2001:db8::1',
    '::1',
  ])('accepts valid IPv4 and IPv6 address %s', value => {
    expect(isValidClientIp(value)).toBe(true)
  })

  it.each([
    undefined,
    '',
    '1'.repeat(46),
    '127.0.0',
    '01.2.3.4',
    '256.1.1.1',
    '1.2.3.a',
    'not-an-ip',
    '2001-db8--1',
    ':',
    '2001:::1',
    '2001::db8::1',
    ':2001:db8:0:0:0:0:1',
    '2001:db8:0:0:0:0:1:',
    '2001:db8:00000::1',
    '2001:db8:0:0:0:0:0:1:2',
    '127.0.0.1\n',
    '127.0.0.1<script>',
  ])('rejects malformed or unsafe client IP %p', value => {
    expect(isValidClientIp(value)).toBe(false)
  })

  it('uses the first non-empty valid forwarded address', () => {
    expect(
      getClientIp(
        new Request('https://app.example.test', {
          headers: { 'x-forwarded-for': ' , 2001:db8::1, 127.0.0.1' },
        }),
      ),
    ).toBe('2001:db8::1')
  })

  it('omits missing, malformed, and unreadable forwarded addresses', () => {
    expect(getClientIp(new Request('https://app.example.test'))).toBeUndefined()
    expect(
      getClientIp(
        new Request('https://app.example.test', {
          headers: { 'x-forwarded-for': 'not-an-ip' },
        }),
      ),
    ).toBeUndefined()
    const request = new Request('https://app.example.test')
    Object.defineProperty(request, 'headers', {
      value: {
        get: () => {
          throw new Error('headers unavailable')
        },
      },
    })
    expect(getClientIp(request)).toBeUndefined()
  })
})
