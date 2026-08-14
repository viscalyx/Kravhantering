import { getAuthConfig } from '@/lib/auth/config'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  createMcpImportValidationDestinationFingerprint,
  createMcpImportValidationPrincipalFingerprint,
} from '@/lib/mcp/import-validation-fingerprint.mjs'

type McpImportDestinationKind =
  | 'requirements_library'
  | 'requirements_specification'

interface FingerprintOptions {
  secret?: string
}

function fingerprintSecret(options: FingerprintOptions): string {
  const secret = options.secret ?? getAuthConfig().cookiePassword
  if (secret.length < 32) {
    throw new Error(
      'MCP import-validation fingerprint secret must be at least 32 characters',
    )
  }
  return secret
}

export function mcpImportValidationPrincipalFingerprint(
  hsaId: string,
  options: FingerprintOptions = {},
): string {
  const normalizedHsaId = hsaId.trim()
  if (!isHsaId(normalizedHsaId)) {
    throw new Error('MCP principal must have a valid HSA-id')
  }
  return createMcpImportValidationPrincipalFingerprint(
    normalizedHsaId,
    fingerprintSecret(options),
  )
}

export function mcpImportValidationDestinationFingerprint(
  destinationKind: McpImportDestinationKind,
  destinationId: number,
  options: FingerprintOptions = {},
): string {
  if (!Number.isInteger(destinationId) || destinationId < 1) {
    throw new Error('MCP import destination ID must be a positive integer')
  }
  return createMcpImportValidationDestinationFingerprint(
    destinationKind,
    destinationId,
    fingerprintSecret(options),
  )
}
