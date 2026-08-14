import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMcpImportValidationPrincipalFingerprint } from '@/lib/mcp/import-validation-fingerprint.mjs'
import {
  mcpImportValidationDestinationFingerprint,
  mcpImportValidationPrincipalFingerprint,
} from '@/lib/mcp/import-validation-principal'

const SECRET = 'test-cookie-password-with-at-least-32-characters'

describe('MCP import-validation principal fingerprints', () => {
  it('creates one non-reversible purpose-separated fingerprint for HSA-id case variants', () => {
    const fingerprint = mcpImportValidationPrincipalFingerprint(
      'SE5560000001-Kalle1',
      { secret: SECRET },
    )

    expect(fingerprint).toHaveLength(64)
    expect(fingerprint).toBe(
      mcpImportValidationPrincipalFingerprint('SE5560000001-kalle1', {
        secret: SECRET,
      }),
    )
    expect(fingerprint).not.toContain('Kalle1')
    expect(fingerprint).not.toBe(
      createHash('sha256').update('se5560000001-kalle1').digest('hex'),
    )
    expect(fingerprint).not.toBe(
      mcpImportValidationDestinationFingerprint('requirements_library', 7, {
        secret: SECRET,
      }),
    )
  })

  it('invalidates outstanding ownership when the authentication secret rotates', () => {
    const hsaId = 'SE5560000001-import1'

    expect(
      mcpImportValidationPrincipalFingerprint(hsaId, { secret: SECRET }),
    ).not.toBe(
      mcpImportValidationPrincipalFingerprint(hsaId, {
        secret: `${SECRET}-rotated`,
      }),
    )
  })

  it('rejects identity values that are not valid HSA-ids', () => {
    expect(() =>
      mcpImportValidationPrincipalFingerprint('mcp-service-account', {
        secret: SECRET,
      }),
    ).toThrow('valid HSA-id')
  })

  it('rejects secrets that are too short at both public and shared boundaries', () => {
    expect(() =>
      mcpImportValidationPrincipalFingerprint('SE5560000001-import1', {
        secret: 'too-short',
      }),
    ).toThrow('at least 32 characters')
    expect(() =>
      createMcpImportValidationPrincipalFingerprint(
        'SE5560000001-import1',
        'too-short',
      ),
    ).toThrow('at least 32 characters')
  })

  it.each([0, 1.5])('rejects invalid destination ID %s', destinationId => {
    expect(() =>
      mcpImportValidationDestinationFingerprint(
        'requirements_library',
        destinationId,
        { secret: SECRET },
      ),
    ).toThrow('positive integer')
  })
})
