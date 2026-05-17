import { describe, expect, it, vi } from 'vitest'
import {
  isForeignKeyViolation,
  logSanitizedError,
  redactSensitiveText,
  toSafeErrorLogValue,
} from '@/lib/http/safe-errors'

describe('safe error helpers', () => {
  it('redacts provider keys, bearer tokens, JWTs, HSA IDs, secrets, and SQL fragments', () => {
    const text = [
      'OpenRouter sk-or-v1-secret123 failed',
      'Authorization: Bearer eyJhbGciOi.demo.payload',
      'employeeHsaId=SE5560000001-12345',
      'client_secret=supersecret',
      'SELECT token FROM sessions',
    ].join(' ')

    const redacted = redactSensitiveText(text)

    expect(redacted).toContain('[OPENROUTER_KEY_REDACTED]')
    expect(redacted).toContain('Bearer [REDACTED]')
    expect(redacted).toContain('[HSA_ID_REDACTED]')
    expect(redacted).toContain('client_secret=[REDACTED]')
    expect(redacted).toContain('[SQL_REDACTED]')
    expect(redacted).not.toMatch(
      /sk-or-v1-|eyJhbGciOi|SE5560000001-12345|supersecret|SELECT/,
    )
  })

  it('redacts error message and stack for log payloads', () => {
    const error = new Error(
      'Failed with apiKey=secret and SELECT password FROM users',
    )
    error.stack =
      'Error: Failed with apiKey=secret\n    at query (Bearer raw-token)'

    const safe = toSafeErrorLogValue(error)

    expect(safe.name).toBe('Error')
    expect(safe.message).not.toContain('secret')
    expect(safe.message).not.toContain('SELECT')
    expect(safe.stack).not.toContain('raw-token')
  })

  it('logs sanitized details without passing raw Error objects', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      logSanitizedError(
        'failed',
        new Error('sk-or-v1-secret SELECT token FROM sessions'),
        { authorization: 'Bearer raw-token' },
      )

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const [, payload] = consoleErrorSpy.mock.calls[0]
      expect(payload).not.toBeInstanceOf(Error)
      expect(JSON.stringify(payload)).not.toMatch(
        /sk-or-v1-secret|SELECT token|raw-token/,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('detects SQL Server foreign-key violations by number or message', () => {
    expect(isForeignKeyViolation({ number: 547 })).toBe(true)
    expect(
      isForeignKeyViolation(
        new Error(
          'The DELETE statement conflicted with the REFERENCE constraint',
        ),
      ),
    ).toBe(true)
    expect(isForeignKeyViolation(new Error('duplicate key value'))).toBe(false)
  })
})
