import { describe, expect, it, vi } from 'vitest'
import {
  getErrorMessage,
  getSafeErrorMessage,
  isDuplicateKeyError,
  isForeignKeyOrConstraintError,
  isForeignKeyViolation,
  logSanitizedError,
  redactSensitiveText,
  toSafeErrorLogValue,
} from '@/lib/http/safe-errors'

describe('safe error helpers', () => {
  it('accepts only explicit, bounded safe messages from Error instances', () => {
    const safeError = Object.assign(new Error('internal detail'), {
      safeMessage: '  Safe explanation  ',
    })

    expect(getSafeErrorMessage(safeError)).toBe('Safe explanation')
    expect(getSafeErrorMessage(new Error('internal detail'))).toBeNull()
    expect(
      getSafeErrorMessage({ safeMessage: 'not an Error instance' }),
    ).toBeNull()
    expect(
      getSafeErrorMessage(
        Object.assign(new Error('internal detail'), {
          safeMessage: 'x'.repeat(1_001),
        }),
      ),
    ).toBeNull()
  })

  it('redacts provider keys, bearer tokens, JWTs, international HSA-id values, secrets, and SQL fragments', () => {
    const text = [
      'OpenRouter sk-or-v1-secret123 failed',
      'Authorization: Bearer eyJhbGciOi.demo.payload',
      'employeeHsaId=SE5560000001-12345',
      'reviewerHsaId=NO5560000001-reviewer1',
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
      /sk-or-v1-|eyJhbGciOi|SE5560000001-12345|NO5560000001-reviewer1|supersecret|SELECT/,
    )
  })

  it('redacts each supported SQL mutation fragment', () => {
    const redacted = redactSensitiveText(
      [
        'INSERT INTO [users] value',
        'UPDATE dbo.users value',
        'DELETE FROM "users" value',
        'MERGE INTO `users` value',
      ].join('; '),
    )

    expect(redacted).toBe(
      '[SQL_REDACTED] value; [SQL_REDACTED] value; [SQL_REDACTED] value; [SQL_REDACTED] value',
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

  it('normalizes unknown errors without leaking unserializable values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const errorWithoutStack = new Error('safe message')
    errorWithoutStack.stack = undefined

    expect(getErrorMessage('plain failure')).toBe('plain failure')
    expect(getErrorMessage(Symbol('offline'))).toBe('Symbol(offline)')
    expect(getErrorMessage({ code: 'offline' })).toBe('{"code":"offline"}')
    expect(getErrorMessage(circular)).toBe('Unknown error')
    expect(getErrorMessage(undefined)).toBe('Unknown error')
    expect(toSafeErrorLogValue(undefined)).toEqual({
      message: 'Unknown error',
    })
    expect(toSafeErrorLogValue(errorWithoutStack)).toEqual({
      message: 'safe message',
      name: 'Error',
    })
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

  it('sanitizes nested arrays and errors in log details', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      logSanitizedError('failed', 'Bearer raw-token', {
        attempts: [
          'password=secret',
          new Error('SE5560000001-user'),
          { query: 'DELETE FROM sessions' },
          3,
        ],
      })

      const payload = consoleErrorSpy.mock.calls[0]?.[1]
      expect(JSON.stringify(payload)).toContain('[REDACTED]')
      expect(JSON.stringify(payload)).not.toMatch(
        /raw-token|password=secret|SE5560000001-user|DELETE FROM/,
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

  it('recognizes duplicate, string-number, and general constraint failures', () => {
    expect(isDuplicateKeyError(new Error('Unique index conflict'))).toBe(true)
    expect(isDuplicateKeyError(new Error('database offline'))).toBe(false)
    expect(isForeignKeyViolation({ number: '547' })).toBe(true)
    expect(isForeignKeyOrConstraintError(new Error('check constraint'))).toBe(
      true,
    )
    expect(isForeignKeyOrConstraintError(new Error('database offline'))).toBe(
      false,
    )
  })
})
