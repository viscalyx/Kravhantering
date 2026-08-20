import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import {
  type AiProviderSecretCryptoCoreError,
  buildAiProviderSecretAadCore,
  validateAiProviderSecretEnvelope,
} from './provider-secret-crypto-core.mjs'
import {
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
} from './provider-secret-keyring.ts'

export const AI_PROVIDER_SECRET_CIPHER_FORMAT_VERSION = 1 as const
export const AI_PROVIDER_SECRET_NONCE_BYTES = 12 as const
export const AI_PROVIDER_SECRET_AUTHENTICATION_TAG_BYTES = 16 as const
const MAX_PROVIDER_SECRET_BYTES = 65_536

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

function rethrowCoreCryptoError(error: unknown): never {
  const coreError = error as AiProviderSecretCryptoCoreError
  throw new AiProviderSecretCryptoError(
    coreError.code as AiProviderSecretCryptoErrorCode,
    coreError.message,
  )
}

export function buildAiProviderSecretAad(
  binding: AiProviderSecretBinding,
  version: Pick<AiProviderSecretEnvelope, 'formatVersion' | 'rootKeyVersion'>,
): Buffer {
  try {
    return buildAiProviderSecretAadCore(binding, version)
  } catch (error) {
    rethrowCoreCryptoError(error)
  }
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
  try {
    validateAiProviderSecretEnvelope(binding, envelope)
  } catch (error) {
    rethrowCoreCryptoError(error)
  }
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
  } catch {
    throw new AiProviderSecretCryptoError(
      'authentication_failed',
      'AI provider-secret authentication failed',
    )
  } finally {
    key.fill(0)
  }
}
