import { readFileSync } from 'node:fs'

export const AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION = 1 as const
export const AI_PROVIDER_SECRET_KEYRING_FILE_ENV =
  'AI_PROVIDER_SECRET_KEYRING_FILE' as const

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export type AiProviderSecretKeyringErrorCode =
  | 'active_write_version_missing'
  | 'invalid_keyring'
  | 'keyring_file_not_configured'
  | 'keyring_file_unavailable'
  | 'root_key_version_missing'

export class AiProviderSecretKeyringError extends Error {
  readonly code: AiProviderSecretKeyringErrorCode

  constructor(code: AiProviderSecretKeyringErrorCode, message: string) {
    super(message)
    this.name = 'AiProviderSecretKeyringError'
    this.code = code
  }
}

export interface AiProviderSecretKeyring {
  readonly activeWriteVersion: string
  readonly formatVersion: typeof AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION
  keyForVersion(version: string): Buffer
  versions(): readonly string[]
}

interface KeyringDocument {
  activeWriteVersion: unknown
  formatVersion: unknown
  keys: unknown
}

function invalid(message: string): never {
  throw new AiProviderSecretKeyringError('invalid_keyring', message)
}

function parseRootKey(version: string, encoded: unknown): Buffer {
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

export function parseAiProviderSecretKeyring(
  serialized: string,
): AiProviderSecretKeyring {
  let document: KeyringDocument
  try {
    document = JSON.parse(serialized) as KeyringDocument
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

  const keys = new Map<string, Buffer>()
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
    keyForVersion(version: string): Buffer {
      const key = keys.get(version)
      if (!key) {
        throw new AiProviderSecretKeyringError(
          'root_key_version_missing',
          `AI provider-secret root key version ${version} is unavailable`,
        )
      }
      return Buffer.from(key)
    },
    versions(): readonly string[] {
      return [...keys.keys()].sort()
    },
  })
}

export function loadAiProviderSecretKeyring(
  env: Readonly<Record<string, string | undefined>> = process.env,
  readFile: (path: string) => string = path => readFileSync(path, 'utf8'),
): AiProviderSecretKeyring {
  const path = env[AI_PROVIDER_SECRET_KEYRING_FILE_ENV]?.trim()
  if (!path) {
    throw new AiProviderSecretKeyringError(
      'keyring_file_not_configured',
      `${AI_PROVIDER_SECRET_KEYRING_FILE_ENV} is not configured`,
    )
  }
  let serialized: string
  try {
    serialized = readFile(path)
  } catch {
    throw new AiProviderSecretKeyringError(
      'keyring_file_unavailable',
      'AI provider-secret keyring file is unavailable',
    )
  }
  return parseAiProviderSecretKeyring(serialized)
}
