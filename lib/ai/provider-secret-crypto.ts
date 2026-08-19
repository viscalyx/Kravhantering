import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import {
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
} from './provider-secret-keyring.ts'

export const AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION = 1 as const
export const AI_PROVIDER_SECRET_NONCE_BYTES = 12 as const
export const AI_PROVIDER_SECRET_AUTHENTICATION_TAG_BYTES = 16 as const
const MAX_PROVIDER_SECRET_BYTES = 65_536
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AiProviderSecretBinding {
  connectionId: string
  secretVersionId: string
}

export interface AiProviderSecretEnvelope {
  authenticationTag: Buffer
  ciphertext: Buffer
  formatVersion: typeof AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION
  nonce: Buffer
  rootKeyVersion: string
}

export type AiProviderSecretCryptoErrorCode =
  | 'authentication_failed'
  | 'invalid_binding'
  | 'invalid_envelope'
  | 'invalid_plaintext'
  | 'root_key_version_missing'

export class AiProviderSecretCryptoError extends Error {
  readonly code: AiProviderSecretCryptoErrorCode

  constructor(code: AiProviderSecretCryptoErrorCode, message: string) {
    super(message)
    this.name = 'AiProviderSecretCryptoError'
    this.code = code
  }
}

function normalizeId(id: string, field: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new AiProviderSecretCryptoError(
      'invalid_binding',
      `AI provider-secret ${field} must be a UUID`,
    )
  }
  return id.toLowerCase()
}

function validateEnvelope(envelope: AiProviderSecretEnvelope): void {
  if (envelope.formatVersion !== AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION) {
    throw new AiProviderSecretCryptoError(
      'invalid_envelope',
      'AI provider-secret cipher format version is unsupported',
    )
  }
  if (envelope.nonce.byteLength !== AI_PROVIDER_SECRET_NONCE_BYTES) {
    throw new AiProviderSecretCryptoError(
      'invalid_envelope',
      `AI provider-secret nonce must be ${AI_PROVIDER_SECRET_NONCE_BYTES} bytes`,
    )
  }
  if (
    envelope.authenticationTag.byteLength !==
    AI_PROVIDER_SECRET_AUTHENTICATION_TAG_BYTES
  ) {
    throw new AiProviderSecretCryptoError(
      'invalid_envelope',
      `AI provider-secret authentication tag must be ${AI_PROVIDER_SECRET_AUTHENTICATION_TAG_BYTES} bytes`,
    )
  }
  if (envelope.ciphertext.byteLength === 0 || !envelope.rootKeyVersion) {
    throw new AiProviderSecretCryptoError(
      'invalid_envelope',
      'AI provider-secret encrypted material is incomplete',
    )
  }
}

export function buildAiProviderSecretAad(
  binding: AiProviderSecretBinding,
  version: Pick<AiProviderSecretEnvelope, 'formatVersion' | 'rootKeyVersion'>,
): Buffer {
  const connectionId = normalizeId(binding.connectionId, 'connection ID')
  const secretVersionId = normalizeId(
    binding.secretVersionId,
    'secret-version ID',
  )
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

export function encryptAiProviderSecret(
  keyring: AiProviderSecretKeyring,
  binding: AiProviderSecretBinding,
  plaintext: string,
): AiProviderSecretEnvelope {
  const plaintextBytes = Buffer.from(plaintext, 'utf8')
  if (
    plaintextBytes.byteLength === 0 ||
    plaintextBytes.byteLength > MAX_PROVIDER_SECRET_BYTES
  ) {
    throw new AiProviderSecretCryptoError(
      'invalid_plaintext',
      `AI provider-secret plaintext must contain 1-${MAX_PROVIDER_SECRET_BYTES} UTF-8 bytes`,
    )
  }
  const envelopeVersion = {
    formatVersion: AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION,
    rootKeyVersion: keyring.activeWriteVersion,
  } as const
  const key = keyring.keyForVersion(envelopeVersion.rootKeyVersion)
  const nonce = randomBytes(AI_PROVIDER_SECRET_NONCE_BYTES)
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: AI_PROVIDER_SECRET_AUTHENTICATION_TAG_BYTES,
    })
    cipher.setAAD(buildAiProviderSecretAad(binding, envelopeVersion))
    const ciphertext = Buffer.concat([
      cipher.update(plaintextBytes),
      cipher.final(),
    ])
    return {
      authenticationTag: cipher.getAuthTag(),
      ciphertext,
      ...envelopeVersion,
      nonce,
    }
  } finally {
    key.fill(0)
    plaintextBytes.fill(0)
  }
}

export function decryptAiProviderSecret(
  keyring: AiProviderSecretKeyring,
  binding: AiProviderSecretBinding,
  envelope: AiProviderSecretEnvelope,
): string {
  validateEnvelope(envelope)
  let key: Buffer
  try {
    key = keyring.keyForVersion(envelope.rootKeyVersion)
  } catch (error) {
    if (
      error instanceof AiProviderSecretKeyringError &&
      error.code === 'root_key_version_missing'
    ) {
      throw new AiProviderSecretCryptoError(
        'root_key_version_missing',
        error.message,
      )
    }
    throw error
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, envelope.nonce, {
      authTagLength: AI_PROVIDER_SECRET_AUTHENTICATION_TAG_BYTES,
    })
    decipher.setAAD(buildAiProviderSecretAad(binding, envelope))
    decipher.setAuthTag(envelope.authenticationTag)
    const plaintext = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ])
    try {
      return plaintext.toString('utf8')
    } finally {
      plaintext.fill(0)
    }
  } catch (error) {
    if (error instanceof AiProviderSecretCryptoError) throw error
    throw new AiProviderSecretCryptoError(
      'authentication_failed',
      'AI provider-secret authentication failed',
    )
  } finally {
    key.fill(0)
  }
}
