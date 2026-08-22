const CIPHER_FORMAT_VERSION = 1
const NONCE_BYTES = 12
const AUTHENTICATION_TAG_BYTES = 16
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export class AiProviderSecretCryptoCoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiProviderSecretCryptoCoreError'
    this.code = code
  }
}

/** @returns {never} */
function invalid(code, message) {
  throw new AiProviderSecretCryptoCoreError(code, message)
}

function normalizeId(id, field) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    return invalid(
      'invalid_binding',
      `AI provider-secret ${field} must be a UUID`,
    )
  }
  return id.toLowerCase()
}

export function validateAiProviderSecretEnvelope(binding, envelope) {
  const connectionId = normalizeId(binding?.connectionId, 'connection ID')
  const secretVersionId = normalizeId(
    binding?.secretVersionId,
    'secret-version ID',
  )
  if (envelope?.formatVersion !== CIPHER_FORMAT_VERSION) {
    return invalid(
      'invalid_envelope',
      'AI provider-secret cipher format version is unsupported',
    )
  }
  if (
    typeof envelope.rootKeyVersion !== 'string' ||
    !VERSION_PATTERN.test(envelope.rootKeyVersion)
  ) {
    return invalid(
      'invalid_envelope',
      'AI provider-secret root-key version is invalid',
    )
  }
  if (
    !Buffer.isBuffer(envelope.nonce) ||
    envelope.nonce.byteLength !== NONCE_BYTES
  ) {
    return invalid(
      'invalid_envelope',
      `AI provider-secret nonce must be ${NONCE_BYTES} bytes`,
    )
  }
  if (
    !Buffer.isBuffer(envelope.authenticationTag) ||
    envelope.authenticationTag.byteLength !== AUTHENTICATION_TAG_BYTES
  ) {
    return invalid(
      'invalid_envelope',
      `AI provider-secret authentication tag must be ${AUTHENTICATION_TAG_BYTES} bytes`,
    )
  }
  if (
    !Buffer.isBuffer(envelope.ciphertext) ||
    envelope.ciphertext.byteLength === 0
  ) {
    return invalid(
      'invalid_envelope',
      'AI provider-secret encrypted material is incomplete',
    )
  }
  return { connectionId, secretVersionId }
}

export function buildAiProviderSecretAadCore(binding, version) {
  const connectionId = normalizeId(binding?.connectionId, 'connection ID')
  const secretVersionId = normalizeId(
    binding?.secretVersionId,
    'secret-version ID',
  )
  if (
    version?.formatVersion !== CIPHER_FORMAT_VERSION ||
    typeof version.rootKeyVersion !== 'string' ||
    !VERSION_PATTERN.test(version.rootKeyVersion)
  ) {
    return invalid(
      'invalid_envelope',
      'AI provider-secret envelope version is invalid',
    )
  }
  return Buffer.from(
    [
      'kravhantering.ai-provider-secret',
      String(version.formatVersion),
      version.rootKeyVersion,
      connectionId,
      secretVersionId,
    ].join('\0'),
    'utf8',
  )
}
