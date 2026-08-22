import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  AiProviderSecretCryptoCoreError,
  buildAiProviderSecretAadCore,
  validateAiProviderSecretEnvelope,
} from '../lib/ai/provider-secret-crypto-core.mjs'

const AUTHENTICATION_TAG_BYTES = 16
const NONCE_BYTES = 12
const ROOT_KEY_BYTES = 32
const DEFAULT_RESTORE_BATCH_SIZE = 100
const FAILURE_SAMPLE_LIMIT = 20
const ROOT_VERSION_SAMPLE_LIMIT = 100
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function fail(message) {
  throw new Error(message)
}

function parseKeyring(serialized) {
  let document
  try {
    document = JSON.parse(serialized)
  } catch {
    return fail('AI provider-secret keyring is not valid JSON.')
  }
  if (
    document?.formatVersion !== 1 ||
    !VERSION_PATTERN.test(document.activeWriteVersion ?? '') ||
    !document.keys ||
    typeof document.keys !== 'object' ||
    Array.isArray(document.keys)
  ) {
    return fail('AI provider-secret keyring is invalid.')
  }
  const keys = new Map()
  for (const [version, encoded] of Object.entries(document.keys)) {
    if (
      !VERSION_PATTERN.test(version) ||
      typeof encoded !== 'string' ||
      encoded.length === 0 ||
      !BASE64_PATTERN.test(encoded)
    ) {
      return fail('AI provider-secret keyring contains an invalid key.')
    }
    const key = Buffer.from(encoded, 'base64')
    if (key.byteLength !== ROOT_KEY_BYTES) {
      return fail('AI provider-secret keyring contains an invalid key.')
    }
    keys.set(version, key)
  }
  if (keys.size === 0) {
    return fail('AI provider-secret keyring is invalid.')
  }
  if (!keys.has(document.activeWriteVersion)) {
    return fail('AI provider-secret active root key is unavailable.')
  }
  return {
    activeWriteVersion: document.activeWriteVersion,
    keyForVersion(version) {
      const key = keys.get(version)
      if (!key) return fail('AI provider-secret root key is unavailable.')
      return Buffer.from(key)
    },
  }
}

export function loadAiProviderSecretMaintenanceKeyring(
  env = process.env,
  readFile = path => readFileSync(path, 'utf8'),
) {
  const path = env.AI_PROVIDER_SECRET_KEYRING_FILE?.trim()
  if (!path) return fail('AI_PROVIDER_SECRET_KEYRING_FILE is not configured.')
  let serialized
  try {
    serialized = readFile(path)
  } catch {
    return fail('AI provider-secret keyring file is unavailable.')
  }
  return parseKeyring(serialized)
}

function binding(row) {
  return { connectionId: row.connectionId, secretVersionId: row.id }
}

function envelope(row, rootKeyVersion = row.rootKeyVersion) {
  return {
    authenticationTag: row.authenticationTag,
    ciphertext: row.ciphertext,
    formatVersion: row.formatVersion,
    nonce: row.nonce,
    rootKeyVersion,
  }
}

function decrypt(row, keyring) {
  validateAiProviderSecretEnvelope(binding(row), envelope(row))
  const key = keyring.keyForVersion(row.rootKeyVersion)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, row.nonce, {
      authTagLength: AUTHENTICATION_TAG_BYTES,
    })
    decipher.setAAD(buildAiProviderSecretAadCore(binding(row), envelope(row)))
    decipher.setAuthTag(row.authenticationTag)
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()])
  } finally {
    key.fill(0)
  }
}

function encrypt(row, plaintext, keyring) {
  const rootKeyVersion = keyring.activeWriteVersion
  const key = keyring.keyForVersion(rootKeyVersion)
  const nonce = randomBytes(NONCE_BYTES)
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: AUTHENTICATION_TAG_BYTES,
    })
    cipher.setAAD(
      buildAiProviderSecretAadCore(binding(row), {
        formatVersion: 1,
        rootKeyVersion,
      }),
    )
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return {
      authenticationTag: cipher.getAuthTag(),
      ciphertext,
      nonce,
      rootKeyVersion,
    }
  } finally {
    key.fill(0)
  }
}

const RETAINED_COLUMNS = `[id], [ai_connection_id] AS [connectionId],
  [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
  [cipher_format_version] AS [formatVersion],
  [root_key_version] AS [rootKeyVersion], [revision_token] AS [revisionToken]`

function restoreBatchSize(value) {
  const batchSize = value ?? DEFAULT_RESTORE_BATCH_SIZE
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    return fail('The provider-secret restore batch size must be 1-1000.')
  }
  return batchSize
}

export async function verifyAiProviderSecretRestoreSet(
  db,
  keyring,
  options = {},
) {
  const batchSize = restoreBatchSize(options.batchSize)
  const failureSample = []
  const referencedRootKeyVersions = new Set()
  let referencedRootKeyVersionsTruncated = false
  let checkedSecretVersionCount = 0
  let failedSecretVersionCount = 0
  let cursor = null
  while (true) {
    const rows = await db.query(
      `SELECT TOP (${batchSize}) ${RETAINED_COLUMNS}
       FROM [ai_provider_secret_versions]
       WHERE [ciphertext] IS NOT NULL
         AND (@0 IS NULL OR [id] > CONVERT(uniqueidentifier, @0))
       ORDER BY [id]`,
      [cursor],
    )
    if (rows.length === 0) break
    for (const row of rows) {
      checkedSecretVersionCount += 1
      if (referencedRootKeyVersions.size < ROOT_VERSION_SAMPLE_LIMIT) {
        referencedRootKeyVersions.add(row.rootKeyVersion)
      } else if (!referencedRootKeyVersions.has(row.rootKeyVersion)) {
        referencedRootKeyVersionsTruncated = true
      }
      let plaintext
      try {
        if (row.rootKeyVersion === options.omitRootKeyVersion) {
          throw new Error('omitted')
        }
        plaintext = decrypt(row, keyring)
      } catch (error) {
        failedSecretVersionCount += 1
        if (failureSample.length < FAILURE_SAMPLE_LIMIT) {
          failureSample.push({
            connectionId: row.connectionId,
            reason:
              error instanceof AiProviderSecretCryptoCoreError
                ? error.code
                : 'authentication_failed',
            rootKeyVersion: row.rootKeyVersion,
            secretVersionId: row.id,
          })
        }
      } finally {
        plaintext?.fill(0)
      }
    }
    cursor = rows.at(-1)?.id ?? null
    if (rows.length < batchSize) break
  }
  const compatible = failedSecretVersionCount === 0
  const omittedRootKeyVersion = options.omitRootKeyVersion ?? null
  return {
    batchSize,
    checkedSecretVersionCount,
    compatible,
    failedSecretVersionCount,
    failureSample,
    failureSampleLimit: FAILURE_SAMPLE_LIMIT,
    failureSampleTruncated: failedSecretVersionCount > failureSample.length,
    omittedRootKeyVersion,
    referencedRootKeyVersions: [...referencedRootKeyVersions].sort(),
    referencedRootKeyVersionsTruncated,
    safeToRemoveOmittedRootKeyVersion:
      omittedRootKeyVersion === null
        ? null
        : compatible && keyring.activeWriteVersion !== omittedRootKeyVersion,
  }
}

export async function reencryptAiProviderSecretBatch(
  db,
  keyring,
  { batchSize, fromRootKeyVersion },
) {
  if (!VERSION_PATTERN.test(fromRootKeyVersion)) {
    return fail('The source root-key version is invalid.')
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    return fail('The provider-secret rotation batch size must be 1-1000.')
  }
  if (fromRootKeyVersion === keyring.activeWriteVersion) {
    return fail(
      'The source root-key version must not be the active write version.',
    )
  }
  const reencryptedCount = await db.transaction(
    'SERIALIZABLE',
    async manager => {
      const rows = await manager.query(
        `SELECT TOP (${batchSize}) [id], [ai_connection_id] AS [connectionId],
         [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
         [cipher_format_version] AS [formatVersion],
         [root_key_version] AS [rootKeyVersion], [revision_token] AS [revisionToken]
       FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       WHERE [root_key_version] = @0 AND [ciphertext] IS NOT NULL
       ORDER BY [created_at], [id]`,
        [fromRootKeyVersion],
      )
      let affectedRowCount = 0
      for (const row of rows) {
        const plaintext = decrypt(row, keyring)
        try {
          const encryption = encrypt(row, plaintext, keyring)
          const updatedRows = await manager.query(
            `DECLARE @updated TABLE ([updatedId] uniqueidentifier NOT NULL);
           UPDATE [ai_provider_secret_versions]
           SET [ciphertext] = @1, [nonce] = @2, [authentication_tag] = @3,
             [cipher_format_version] = 1, [root_key_version] = @4,
             [revision_token] = NEWID()
           OUTPUT INSERTED.[id] INTO @updated
           WHERE [id] = @0 AND [revision_token] = @5
             AND [root_key_version] = @6;
           SELECT [updatedId] FROM @updated;`,
            [
              row.id,
              encryption.ciphertext,
              encryption.nonce,
              encryption.authenticationTag,
              encryption.rootKeyVersion,
              row.revisionToken,
              fromRootKeyVersion,
            ],
          )
          affectedRowCount += updatedRows.length
        } finally {
          plaintext.fill(0)
        }
      }
      return affectedRowCount
    },
  )
  const remainingRows = await db.query(
    `SELECT COUNT_BIG(*) AS [count]
     FROM [ai_provider_secret_versions]
     WHERE [root_key_version] = @0 AND [ciphertext] IS NOT NULL`,
    [fromRootKeyVersion],
  )
  const remainingCount = Number(remainingRows[0]?.count ?? 0)
  return {
    fromRootKeyVersion,
    reencryptedCount,
    remainingCount,
    safeToRemoveFromRootKeyVersion: remainingCount === 0,
    toRootKeyVersion: keyring.activeWriteVersion,
  }
}
