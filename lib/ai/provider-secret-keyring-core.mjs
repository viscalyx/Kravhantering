export const AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION = 1
export const AI_PROVIDER_SECRET_KEYRING_FILE_ENV =
  'AI_PROVIDER_SECRET_KEYRING_FILE'

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export class AiProviderSecretKeyringError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiProviderSecretKeyringError'
    this.code = code
  }
}

function invalid(message) {
  throw new AiProviderSecretKeyringError('invalid_keyring', message)
}

function parseRootKey(version, encoded) {
  if (
    typeof encoded !== 'string' ||
    !BASE64_PATTERN.test(encoded) ||
    encoded.length === 0
  ) {
    return invalid(`AI provider-secret root key ${version} is not valid base64`)
  }
  const key = Buffer.from(encoded, 'base64')
  if (key.byteLength !== 32) {
    return invalid(
      `AI provider-secret root key ${version} must decode to exactly 32 bytes`,
    )
  }
  return key
}

export function parseAiProviderSecretKeyring(serialized) {
  let document
  try {
    document = JSON.parse(serialized)
  } catch {
    return invalid('AI provider-secret keyring is not valid JSON')
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return invalid('AI provider-secret keyring must be a JSON object')
  }
  if (document.formatVersion !== AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION) {
    return invalid(
      `AI provider-secret keyring format version must be ${AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION}`,
    )
  }
  if (
    typeof document.activeWriteVersion !== 'string' ||
    !VERSION_PATTERN.test(document.activeWriteVersion)
  ) {
    return invalid('AI provider-secret active write version is invalid')
  }
  if (
    !document.keys ||
    typeof document.keys !== 'object' ||
    Array.isArray(document.keys)
  ) {
    return invalid('AI provider-secret keyring keys must be a JSON object')
  }

  const keys = new Map()
  for (const [version, encoded] of Object.entries(document.keys)) {
    if (!VERSION_PATTERN.test(version)) {
      return invalid(
        `AI provider-secret root key version ${version} is invalid`,
      )
    }
    keys.set(version, parseRootKey(version, encoded))
  }
  if (keys.size === 0) {
    return invalid('AI provider-secret keyring must contain at least one key')
  }
  if (!keys.has(document.activeWriteVersion)) {
    throw new AiProviderSecretKeyringError(
      'active_write_version_missing',
      `AI provider-secret active write version ${document.activeWriteVersion} is unavailable`,
    )
  }

  const activeWriteVersion = document.activeWriteVersion
  return Object.freeze({
    activeWriteVersion,
    formatVersion: AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION,
    keyForVersion(version) {
      const key = keys.get(version)
      if (!key) {
        throw new AiProviderSecretKeyringError(
          'root_key_version_missing',
          `AI provider-secret root key version ${version} is unavailable`,
        )
      }
      return Buffer.from(key)
    },
    versions() {
      return [...keys.keys()].sort()
    },
  })
}
