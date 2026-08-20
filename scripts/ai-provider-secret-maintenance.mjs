import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const AUTHENTICATION_TAG_BYTES = 16
const NONCE_BYTES = 12
const ROOT_KEY_BYTES = 32
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

function aad(row, rootKeyVersion) {
  return Buffer.from(
    [
      'kravhantering.ai-provider-secret',
      '1',
      rootKeyVersion,
      row.connectionId.toLowerCase(),
      row.id.toLowerCase(),
    ].join('\0'),
    'utf8',
  )
}

function decrypt(row, keyring) {
  const key = keyring.keyForVersion(row.rootKeyVersion)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, row.nonce, {
      authTagLength: AUTHENTICATION_TAG_BYTES,
    })
    decipher.setAAD(aad(row, row.rootKeyVersion))
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
    cipher.setAAD(aad(row, rootKeyVersion))
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

const SELECT_RETAINED = `SELECT [id], [ai_connection_id] AS [connectionId],
  [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
  [root_key_version] AS [rootKeyVersion], [revision_token] AS [revisionToken]
  FROM [ai_provider_secret_versions]
  WHERE [ciphertext] IS NOT NULL`

export async function verifyAiProviderSecretRestoreSet(
  db,
  keyring,
  options = {},
) {
  const rows = await db.query(
    `${SELECT_RETAINED} ORDER BY [root_key_version], [ai_connection_id], [revision_number]`,
  )
  const results = rows.map(row => {
    let plaintext
    try {
      if (row.rootKeyVersion === options.omitRootKeyVersion) {
        throw new Error('omitted')
      }
      plaintext = decrypt(row, keyring)
      return {
        available: true,
        connectionId: row.connectionId,
        rootKeyVersion: row.rootKeyVersion,
        secretVersionId: row.id,
      }
    } catch {
      return {
        available: false,
        connectionId: row.connectionId,
        reason: 'authentication_failed',
        rootKeyVersion: row.rootKeyVersion,
        secretVersionId: row.id,
      }
    } finally {
      plaintext?.fill(0)
    }
  })
  const compatible = results.every(result => result.available)
  const referencedRootKeyVersions = [
    ...new Set(rows.map(row => row.rootKeyVersion)),
  ]
  const omittedRootKeyVersion = options.omitRootKeyVersion ?? null
  return {
    checkedSecretVersionCount: rows.length,
    compatible,
    omittedRootKeyVersion,
    referencedRootKeyVersions,
    results,
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
         [root_key_version] AS [rootKeyVersion], [revision_token] AS [revisionToken]
       FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       WHERE [root_key_version] = @0 AND [ciphertext] IS NOT NULL
       ORDER BY [created_at], [id]`,
        [fromRootKeyVersion],
      )
      for (const row of rows) {
        const plaintext = decrypt(row, keyring)
        try {
          const encryption = encrypt(row, plaintext, keyring)
          await manager.query(
            `UPDATE [ai_provider_secret_versions]
           SET [ciphertext] = @1, [nonce] = @2, [authentication_tag] = @3,
             [cipher_format_version] = 1, [root_key_version] = @4,
             [revision_token] = NEWID()
           WHERE [id] = @0 AND [revision_token] = @5
             AND [root_key_version] = @6`,
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
        } finally {
          plaintext.fill(0)
        }
      }
      return rows.length
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
