import { createHash, createHmac } from 'node:crypto'

const PRINCIPAL_KEY_CONTEXT = 'kravhantering:mcp-import-validation-principal:v1'
const DESTINATION_KEY_CONTEXT =
  'kravhantering:mcp-import-validation-destination:v1'

function keyedFingerprint(value, context, secret) {
  if (secret.length < 32) {
    throw new Error(
      'MCP import-validation fingerprint secret must be at least 32 characters',
    )
  }

  const key = createHash('sha256')
    .update(context, 'utf8')
    .update('\0', 'utf8')
    .update(secret, 'utf8')
    .digest()

  return createHmac('sha256', key).update(value, 'utf8').digest('hex')
}

export function createMcpImportValidationPrincipalFingerprint(hsaId, secret) {
  return keyedFingerprint(hsaId.toLowerCase(), PRINCIPAL_KEY_CONTEXT, secret)
}

export function createMcpImportValidationDestinationFingerprint(
  destinationKind,
  destinationId,
  secret,
) {
  return keyedFingerprint(
    `${destinationKind}:${destinationId}`,
    DESTINATION_KEY_CONTEXT,
    secret,
  )
}
