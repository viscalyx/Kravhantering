export const AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION: 1
export const AI_PROVIDER_SECRET_KEYRING_FILE_ENV: 'AI_PROVIDER_SECRET_KEYRING_FILE'

export type AiProviderSecretKeyringErrorCode =
  | 'active_write_version_missing'
  | 'invalid_keyring'
  | 'keyring_file_not_configured'
  | 'keyring_file_unavailable'
  | 'root_key_version_missing'

export class AiProviderSecretKeyringError extends Error {
  readonly code: AiProviderSecretKeyringErrorCode
  constructor(code: AiProviderSecretKeyringErrorCode, message: string)
}

export interface AiProviderSecretKeyring {
  readonly activeWriteVersion: string
  readonly formatVersion: typeof AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION
  keyForVersion(version: string): Buffer
  versions(): readonly string[]
}

export function parseAiProviderSecretKeyring(
  serialized: string,
): AiProviderSecretKeyring
