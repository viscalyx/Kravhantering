import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { extractPids } = require('../extract-pids.js')

describe('extract-pids.js', () => {
  it('collects unique pids for the requested port', () => {
    const input = [
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=101,fd=20))',
      'LISTEN 0 511 127.0.0.1:3001 0.0.0.0:* users:(("node",pid=202,fd=21))',
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=101,fd=22))',
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=303,fd=23))',
    ].join('\n')

    expect(extractPids(input, '3000')).toEqual(['101', '303'])
  })

  it('matches exact port numbers instead of prefixes', () => {
    const input = [
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=101,fd=20))',
      'LISTEN 0 511 127.0.0.1:30001 0.0.0.0:* users:(("node",pid=202,fd=21))',
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=303,fd=22))',
    ].join('\n')

    expect(extractPids(input, '3000')).toEqual(['101', '303'])
  })

  it('does not capture a pid from a later line', () => {
    const input = [
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node"',
      'LISTEN 0 511 127.0.0.1:3001 0.0.0.0:* users:(("node",pid=202,fd=21))',
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=303,fd=22))',
    ].join('\n')

    expect(extractPids(input, '3000')).toEqual(['303'])
  })

  it('rejects invalid port expressions', () => {
    expect(() => extractPids('', '3000|.*')).toThrow(
      'PORT must be an integer between 1 and 65535.',
    )
  })

  it('rejects out-of-range ports', () => {
    expect(() => extractPids('', '70000')).toThrow(
      'PORT must be an integer between 1 and 65535.',
    )
  })
})
