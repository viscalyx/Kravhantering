import { readFileSync } from 'node:fs'
import {
  AI_PROVIDER_SECRET_KEYRING_FILE_ENV,
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
  parseAiProviderSecretKeyring,
} from './provider-secret-keyring-core.mjs'

export {
  AI_PROVIDER_SECRET_KEYRING_FILE_ENV,
  AI_PROVIDER_SECRET_KEYRING_FORMAT_VERSION,
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
  type AiProviderSecretKeyringErrorCode,
  parseAiProviderSecretKeyring,
} from './provider-secret-keyring-core.mjs'

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
