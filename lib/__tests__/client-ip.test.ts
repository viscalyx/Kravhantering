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
    '203.0.113.5 10.0.0.1',
    '"203.0.113.5"',
    '<script>',
    '203.0.113.5\nX-Injected: yes',
    '203.0.113.5:443',
    '[2001:db8::1]:443',
    'example.test',
    '999.0.0.1',
  ])('rejects malformed or unsafe client IP %p', value => {
    expect(isValidClientIp(value)).toBe(false)
  })

  it('uses only the canonical address produced by the trusted edge', () => {
    expect(
      getClientIp(
        new Request('https://app.example.test', {
          headers: {
            'x-forwarded-for': '198.51.100.8, 127.0.0.1',
            'x-kravhantering-client-ip': '2001:db8::1',
          },
        }),
      ),
    ).toBe('2001:db8::1')
  })

  it('ignores raw forwarding headers without a canonical address', () => {
    const request = new Request('https://app.example.test', {
      headers: {
        forwarded: 'for=203.0.113.8;proto=https',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      },
    })

    expect(getClientIp(request)).toBeUndefined()
  })

  it('omits missing, empty, malformed, prepended, and unreadable values', () => {
    expect(getClientIp(new Request('https://app.example.test'))).toBeUndefined()
    for (const value of ['', 'not-an-ip', '198.51.100.8, 203.0.113.10']) {
      expect(
        getClientIp(
          new Request('https://app.example.test', {
            headers: { 'x-kravhantering-client-ip': value },
          }),
        ),
      ).toBeUndefined()
    }
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
