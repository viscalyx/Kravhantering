import { createHash, createHmac } from 'node:crypto'
import { getAuthConfig } from '@/lib/auth/config'
import { isHsaId } from '@/lib/auth/hsa-id'

type McpImportDestinationKind =
  | 'requirements_library'
  | 'requirements_specification'

interface FingerprintOptions {
  secret?: string
}

const PRINCIPAL_KEY_CONTEXT = 'kravhantering:mcp-import-validation-principal:v1'
const DESTINATION_KEY_CONTEXT =
  'kravhantering:mcp-import-validation-destination:v1'

function fingerprintSecret(options: FingerprintOptions): string {
  const secret = options.secret ?? getAuthConfig().cookiePassword
  if (secret.length < 32) {
    throw new Error(
      'MCP import-validation fingerprint secret must be at least 32 characters',
    )
  }
  return secret
}

function derivedKey(secret: string, context: string): Buffer {
  return createHash('sha256')
    .update(context, 'utf8')
    .update('\0', 'utf8')
    .update(secret, 'utf8')
    .digest()
}

function keyedFingerprint(
  value: string,
  context: string,
  options: FingerprintOptions,
): string {
  return createHmac('sha256', derivedKey(fingerprintSecret(options), context))
    .update(value, 'utf8')
    .digest('hex')
}

export function mcpImportValidationPrincipalFingerprint(
  hsaId: string,
  options: FingerprintOptions = {},
): string {
  const normalizedHsaId = hsaId.trim()
  if (!isHsaId(normalizedHsaId)) {
    throw new Error('MCP principal must have a valid HSA-id')
  }
  return keyedFingerprint(
    normalizedHsaId.toLowerCase(),
    PRINCIPAL_KEY_CONTEXT,
    options,
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
  return keyedFingerprint(
    `${destinationKind}:${destinationId}`,
    DESTINATION_KEY_CONTEXT,
    options,
  )
}
