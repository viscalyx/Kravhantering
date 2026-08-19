import { randomUUID } from 'node:crypto'
import type { SqlServerDatabase } from '@/lib/db'
import {
  AiProviderSecretCryptoError,
  type AiProviderSecretEnvelope,
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from './provider-secret-crypto.ts'
import {
  type AiProviderSecretKeyring,
  AiProviderSecretKeyringError,
} from './provider-secret-keyring.ts'

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

export type AiProviderSecretVersionStatus =
  | 'active'
  | 'candidate'
  | 'superseded'

interface AiProviderSecretRow {
  activatedAt: Date | string | null
  authenticationTag: Buffer | null
  ciphertext: Buffer | null
  ciphertextDeletedAt?: Date | string | null
  connectionId: string
  createdAt: Date | string
  formatVersion: number
  id: string
  nonce: Buffer | null
  providerRevokedAt?: Date | string | null
  revisionNumber: number | string
  revisionToken: string
  rootKeyVersion: string
  status: AiProviderSecretVersionStatus
  verifiedAt: Date | string | null
}

export interface AiProviderSecretVersionMetadata {
  activatedAt: string | null
  ciphertextDeletedAt: string | null
  connectionId: string
  createdAt: string
  id: string
  providerRevokedAt: string | null
  revisionNumber: number
  revisionToken: string
  rootKeyVersion: string
  status: AiProviderSecretVersionStatus
  verifiedAt: string | null
}

export type AiProviderSecretUnavailableReason =
  | 'authentication_failed'
  | 'encrypted_material_deleted'
  | 'root_key_version_missing'
  | 'secret_missing'

export type AiProviderSecretAvailability =
  | {
      available: true
      rootKeyVersion: string
      secretVersionId: string
    }
  | {
      available: false
      reason: AiProviderSecretUnavailableReason
      rootKeyVersion?: string
      secretVersionId?: string
    }

export interface AiProviderSecretRestoreVerificationResult {
  available: boolean
  connectionId: string
  reason?: AiProviderSecretUnavailableReason
  rootKeyVersion: string
  secretVersionId: string
}

export interface AiProviderSecretRestoreVerificationReport {
  checkedSecretVersionCount: number
  compatible: boolean
  omittedRootKeyVersion: string | null
  referencedRootKeyVersions: readonly string[]
  results: readonly AiProviderSecretRestoreVerificationResult[]
  safeToRemoveOmittedRootKeyVersion: boolean | null
}

export class AiProviderSecretUnavailableError extends Error {
  readonly connectionId: string
  readonly reason: AiProviderSecretUnavailableReason
  readonly rootKeyVersion?: string
  readonly secretVersionId?: string

  constructor(
    connectionId: string,
    availability: Extract<AiProviderSecretAvailability, { available: false }>,
  ) {
    super(`AI provider secret is unavailable: ${availability.reason}`)
    this.name = 'AiProviderSecretUnavailableError'
    this.connectionId = connectionId
    this.reason = availability.reason
    this.rootKeyVersion = availability.rootKeyVersion
    this.secretVersionId = availability.secretVersionId
  }
}

export interface WriteAiProviderSecretCandidateInput {
  connectionId: string
  plaintext: string
}

export interface ActivateAiProviderSecretVersionInput {
  connectionId: string
  secretVersionId: string
  verify(plaintext: string): Promise<void>
}

export interface ConfirmAiProviderSecretRevocationInput {
  connectionId: string
  secretVersionId: string
}

export interface DeleteAiProviderSecretCandidateInput {
  connectionId: string
  secretVersionId: string
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function metadata(row: AiProviderSecretRow): AiProviderSecretVersionMetadata {
  return {
    activatedAt: iso(row.activatedAt),
    ciphertextDeletedAt: iso(row.ciphertextDeletedAt),
    connectionId: row.connectionId,
    createdAt: iso(row.createdAt) as string,
    id: row.id,
    providerRevokedAt: iso(row.providerRevokedAt),
    revisionNumber: Number(row.revisionNumber),
    revisionToken: row.revisionToken,
    rootKeyVersion: row.rootKeyVersion,
    status: row.status,
    verifiedAt: iso(row.verifiedAt),
  }
}

function envelope(row: AiProviderSecretRow): AiProviderSecretEnvelope | null {
  if (!row.ciphertext || !row.nonce || !row.authenticationTag) return null
  return {
    authenticationTag: row.authenticationTag,
    ciphertext: row.ciphertext,
    formatVersion: row.formatVersion as 1,
    nonce: row.nonce,
    rootKeyVersion: row.rootKeyVersion,
  }
}

async function selectActiveSecret(
  executor: QueryExecutor,
  connectionId: string,
): Promise<AiProviderSecretRow | undefined> {
  const rows = await executor.query<AiProviderSecretRow[]>(
    `SELECT [id], [ai_connection_id] AS [connectionId],
       [revision_number] AS [revisionNumber], [status],
       [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
       [cipher_format_version] AS [formatVersion],
       [root_key_version] AS [rootKeyVersion],
       [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
       [activated_at] AS [activatedAt],
       [provider_revoked_at] AS [providerRevokedAt],
       [ciphertext_deleted_at] AS [ciphertextDeletedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_provider_secret_versions]
     WHERE [ai_connection_id] = @0 AND [status] = N'active'`,
    [connectionId],
  )
  return rows[0]
}

async function selectActivatableSecret(
  executor: QueryExecutor,
  connectionId: string,
  secretVersionId: string,
): Promise<AiProviderSecretRow | undefined> {
  const rows = await executor.query<AiProviderSecretRow[]>(
    `SELECT [id], [ai_connection_id] AS [connectionId],
       [revision_number] AS [revisionNumber], [status],
       [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
       [cipher_format_version] AS [formatVersion],
       [root_key_version] AS [rootKeyVersion],
       [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
       [activated_at] AS [activatedAt],
       [provider_revoked_at] AS [providerRevokedAt],
       [ciphertext_deleted_at] AS [ciphertextDeletedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_provider_secret_versions]
     WHERE [id] = @0 AND [ai_connection_id] = @1
       AND [status] IN (N'candidate', N'superseded')`,
    [secretVersionId, connectionId],
  )
  return rows[0]
}

function decryptRow(
  keyring: AiProviderSecretKeyring,
  row: AiProviderSecretRow,
): string {
  const encrypted = envelope(row)
  if (!encrypted) {
    throw new AiProviderSecretUnavailableError(row.connectionId, {
      available: false,
      reason: 'encrypted_material_deleted',
      rootKeyVersion: row.rootKeyVersion,
      secretVersionId: row.id,
    })
  }
  try {
    return decryptAiProviderSecret(
      keyring,
      { connectionId: row.connectionId, secretVersionId: row.id },
      encrypted,
    )
  } catch (error) {
    const reason =
      error instanceof AiProviderSecretCryptoError &&
      error.code === 'root_key_version_missing'
        ? 'root_key_version_missing'
        : 'authentication_failed'
    throw new AiProviderSecretUnavailableError(row.connectionId, {
      available: false,
      reason,
      rootKeyVersion: row.rootKeyVersion,
      secretVersionId: row.id,
    })
  }
}

export async function writeAiProviderSecretCandidate(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  input: WriteAiProviderSecretCandidateInput,
): Promise<AiProviderSecretVersionMetadata> {
  const secretVersionId = randomUUID()
  const encrypted = encryptAiProviderSecret(
    keyring,
    { connectionId: input.connectionId, secretVersionId },
    input.plaintext,
  )
  const rows = await db.transaction('SERIALIZABLE', manager =>
    manager.query<AiProviderSecretRow[]>(
      `IF NOT EXISTS (
         SELECT 1 FROM [ai_connections] WITH (UPDLOCK, HOLDLOCK)
         WHERE [id] = @0
       )
         THROW 51100, 'AI connection does not exist.', 1;

       DECLARE @revision_number int = (
         SELECT COALESCE(MAX([revision_number]), 0) + 1
         FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
         WHERE [ai_connection_id] = @0
       );

       INSERT INTO [ai_provider_secret_versions] (
         [id], [ai_connection_id], [revision_number], [status], [ciphertext],
         [nonce], [authentication_tag], [cipher_format_version],
         [root_key_version], [created_at]
       )
       OUTPUT INSERTED.[id], INSERTED.[ai_connection_id] AS [connectionId],
         INSERTED.[revision_number] AS [revisionNumber], INSERTED.[status],
         INSERTED.[root_key_version] AS [rootKeyVersion],
         INSERTED.[created_at] AS [createdAt],
         INSERTED.[verified_at] AS [verifiedAt],
         INSERTED.[activated_at] AS [activatedAt],
         INSERTED.[provider_revoked_at] AS [providerRevokedAt],
         INSERTED.[ciphertext_deleted_at] AS [ciphertextDeletedAt],
         INSERTED.[revision_token] AS [revisionToken]
       VALUES (
         @1, @0, @revision_number, N'candidate', @2, @3, @4, @5, @6,
         SYSUTCDATETIME()
       );`,
      [
        input.connectionId,
        secretVersionId,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authenticationTag,
        encrypted.formatVersion,
        encrypted.rootKeyVersion,
      ],
    ),
  )
  const row = rows[0]
  if (!row) throw new Error('AI provider-secret candidate was not created')
  return metadata(row)
}

export async function getAiProviderSecretAvailability(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  connectionId: string,
): Promise<AiProviderSecretAvailability> {
  const row = await selectActiveSecret(db, connectionId)
  if (!row) return { available: false, reason: 'secret_missing' }
  try {
    decryptRow(keyring, row)
    return {
      available: true,
      rootKeyVersion: row.rootKeyVersion,
      secretVersionId: row.id,
    }
  } catch (error) {
    if (error instanceof AiProviderSecretUnavailableError) {
      return {
        available: false,
        reason: error.reason,
        ...(error.rootKeyVersion
          ? { rootKeyVersion: error.rootKeyVersion }
          : {}),
        ...(error.secretVersionId
          ? { secretVersionId: error.secretVersionId }
          : {}),
      }
    }
    throw error
  }
}

/**
 * Internal adapter-call boundary. Callers must not return, log or persist the
 * callback argument. The callback is non-value-bearing so decrypted material
 * cannot escape through this function's return type.
 */
export async function withActiveAiProviderSecret(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  connectionId: string,
  callback: (plaintext: string) => Promise<void>,
): Promise<void> {
  const row = await selectActiveSecret(db, connectionId)
  if (!row) {
    throw new AiProviderSecretUnavailableError(connectionId, {
      available: false,
      reason: 'secret_missing',
    })
  }
  await callback(decryptRow(keyring, row))
}

export async function activateAiProviderSecretVersion(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  input: ActivateAiProviderSecretVersionInput,
): Promise<AiProviderSecretVersionMetadata> {
  const candidate = await selectActivatableSecret(
    db,
    input.connectionId,
    input.secretVersionId,
  )
  if (!candidate) {
    throw new AiProviderSecretUnavailableError(input.connectionId, {
      available: false,
      reason: 'secret_missing',
      secretVersionId: input.secretVersionId,
    })
  }
  await input.verify(decryptRow(keyring, candidate))

  const rows = await db.transaction('SERIALIZABLE', manager =>
    manager.query<AiProviderSecretRow[]>(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();

       IF NOT EXISTS (
         SELECT 1 FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
         WHERE [id] = @0 AND [ai_connection_id] = @1
           AND [revision_token] = @2
           AND [status] IN (N'candidate', N'superseded')
           AND [ciphertext] IS NOT NULL AND [provider_revoked_at] IS NULL
       )
         THROW 51101, 'AI provider-secret version is no longer activatable.', 1;

       UPDATE [ai_provider_secret_versions]
       SET [status] = N'superseded', [deactivated_at] = @now,
         [revision_token] = NEWID()
       WHERE [ai_connection_id] = @1 AND [status] = N'active';

       UPDATE [ai_provider_secret_versions]
       SET [status] = N'active', [verified_at] = @now,
         [activated_at] = COALESCE([activated_at], @now),
         [deactivated_at] = NULL, [revision_token] = NEWID()
       OUTPUT INSERTED.[id], INSERTED.[ai_connection_id] AS [connectionId],
         INSERTED.[revision_number] AS [revisionNumber], INSERTED.[status],
         INSERTED.[root_key_version] AS [rootKeyVersion],
         INSERTED.[created_at] AS [createdAt],
         INSERTED.[verified_at] AS [verifiedAt],
         INSERTED.[activated_at] AS [activatedAt],
         INSERTED.[provider_revoked_at] AS [providerRevokedAt],
         INSERTED.[ciphertext_deleted_at] AS [ciphertextDeletedAt],
         INSERTED.[revision_token] AS [revisionToken]
       WHERE [id] = @0 AND [ai_connection_id] = @1;`,
      [input.secretVersionId, input.connectionId, candidate.revisionToken],
    ),
  )
  const active = rows[0]
  if (!active) throw new Error('AI provider-secret version was not activated')
  return metadata(active)
}

export async function confirmAiProviderSecretRevocation(
  db: SqlServerDatabase,
  input: ConfirmAiProviderSecretRevocationInput,
): Promise<AiProviderSecretVersionMetadata> {
  const rows = await db.transaction('SERIALIZABLE', manager =>
    manager.query<AiProviderSecretRow[]>(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       UPDATE [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       SET [ciphertext] = NULL, [nonce] = NULL,
         [authentication_tag] = NULL, [provider_revoked_at] = @now,
         [ciphertext_deleted_at] = @now, [revision_token] = NEWID()
       OUTPUT INSERTED.[id], INSERTED.[ai_connection_id] AS [connectionId],
         INSERTED.[revision_number] AS [revisionNumber], INSERTED.[status],
         INSERTED.[root_key_version] AS [rootKeyVersion],
         INSERTED.[created_at] AS [createdAt],
         INSERTED.[verified_at] AS [verifiedAt],
         INSERTED.[activated_at] AS [activatedAt],
         INSERTED.[provider_revoked_at] AS [providerRevokedAt],
         INSERTED.[ciphertext_deleted_at] AS [ciphertextDeletedAt],
         INSERTED.[revision_token] AS [revisionToken]
       WHERE [id] = @0 AND [ai_connection_id] = @1
         AND [status] = N'superseded' AND [ciphertext] IS NOT NULL;`,
      [input.secretVersionId, input.connectionId],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw new Error(
      'Only a superseded, encrypted AI provider-secret version can be confirmed revoked',
    )
  }
  return metadata(row)
}

export async function deleteAiProviderSecretCandidate(
  db: SqlServerDatabase,
  input: DeleteAiProviderSecretCandidateInput,
): Promise<boolean> {
  const rows = await db.transaction('SERIALIZABLE', manager =>
    manager.query<Array<{ deletedId: string }>>(
      `DELETE FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       OUTPUT DELETED.[id] AS [deletedId]
       WHERE [id] = @0 AND [ai_connection_id] = @1
         AND [status] = N'candidate';`,
      [input.secretVersionId, input.connectionId],
    ),
  )
  return rows[0]?.deletedId === input.secretVersionId
}

export async function reencryptAiProviderSecrets(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  input: { fromRootKeyVersion: string },
): Promise<{
  fromRootKeyVersion: string
  reencryptedCount: number
  toRootKeyVersion: string
}> {
  const toRootKeyVersion = keyring.activeWriteVersion
  if (input.fromRootKeyVersion === toRootKeyVersion) {
    return {
      fromRootKeyVersion: input.fromRootKeyVersion,
      reencryptedCount: 0,
      toRootKeyVersion,
    }
  }
  const count = await db.transaction('SERIALIZABLE', async manager => {
    const rows = await manager.query<AiProviderSecretRow[]>(
      `SELECT [id], [ai_connection_id] AS [connectionId],
         [revision_number] AS [revisionNumber], [status],
         [ciphertext], [nonce],
         [authentication_tag] AS [authenticationTag],
         [cipher_format_version] AS [formatVersion],
         [root_key_version] AS [rootKeyVersion],
         [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
         [activated_at] AS [activatedAt],
         [revision_token] AS [revisionToken]
       FROM [ai_provider_secret_versions] WITH (UPDLOCK, HOLDLOCK)
       WHERE [root_key_version] = @0 AND [ciphertext] IS NOT NULL`,
      [input.fromRootKeyVersion],
    )
    for (const row of rows) {
      const plaintext = decryptRow(keyring, row)
      const encrypted = encryptAiProviderSecret(
        keyring,
        { connectionId: row.connectionId, secretVersionId: row.id },
        plaintext,
      )
      await manager.query(
        `UPDATE [ai_provider_secret_versions]
         SET [ciphertext] = @1, [nonce] = @2, [authentication_tag] = @3,
           [cipher_format_version] = @4, [root_key_version] = @5,
           [revision_token] = NEWID()
         WHERE [id] = @0 AND [revision_token] = @6`,
        [
          row.id,
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.authenticationTag,
          encrypted.formatVersion,
          encrypted.rootKeyVersion,
          row.revisionToken,
        ],
      )
    }
    return rows.length
  })
  return {
    fromRootKeyVersion: input.fromRootKeyVersion,
    reencryptedCount: count,
    toRootKeyVersion,
  }
}

export async function listReferencedAiProviderSecretRootKeyVersions(
  db: SqlServerDatabase,
): Promise<readonly string[]> {
  const rows = await db.query<Array<{ rootKeyVersion: string }>>(
    `SELECT DISTINCT [root_key_version] AS [rootKeyVersion]
     FROM [ai_provider_secret_versions]
     WHERE [ciphertext] IS NOT NULL
     ORDER BY [root_key_version]`,
  )
  return rows.map(row => row.rootKeyVersion)
}

function withoutRootKeyVersion(
  keyring: AiProviderSecretKeyring,
  omittedRootKeyVersion: string,
): AiProviderSecretKeyring {
  return {
    activeWriteVersion: keyring.activeWriteVersion,
    formatVersion: keyring.formatVersion,
    keyForVersion(version: string): Buffer {
      if (version === omittedRootKeyVersion) {
        throw new AiProviderSecretKeyringError(
          'root_key_version_missing',
          'The requested AI provider-secret root-key version is unavailable.',
        )
      }
      return keyring.keyForVersion(version)
    },
    versions(): readonly string[] {
      return keyring
        .versions()
        .filter(version => version !== omittedRootKeyVersion)
    },
  }
}

/**
 * Restore verification boundary. It authenticates every retained encrypted
 * row and returns opaque identifiers plus pass/fail evidence only.
 */
export async function verifyAiProviderSecretRestoreSet(
  db: SqlServerDatabase,
  keyring: AiProviderSecretKeyring,
  options: { omitRootKeyVersion?: string } = {},
): Promise<AiProviderSecretRestoreVerificationReport> {
  const rows = await db.query<AiProviderSecretRow[]>(
    `SELECT [id], [ai_connection_id] AS [connectionId],
       [revision_number] AS [revisionNumber], [status],
       [ciphertext], [nonce], [authentication_tag] AS [authenticationTag],
       [cipher_format_version] AS [formatVersion],
       [root_key_version] AS [rootKeyVersion],
       [created_at] AS [createdAt], [verified_at] AS [verifiedAt],
       [activated_at] AS [activatedAt],
       [revision_token] AS [revisionToken]
     FROM [ai_provider_secret_versions]
     WHERE [ciphertext] IS NOT NULL
     ORDER BY [root_key_version], [ai_connection_id], [revision_number]`,
  )
  const verificationKeyring = options.omitRootKeyVersion
    ? withoutRootKeyVersion(keyring, options.omitRootKeyVersion)
    : keyring
  const results = rows.map(row => {
    try {
      decryptRow(verificationKeyring, row)
      return {
        available: true,
        connectionId: row.connectionId,
        rootKeyVersion: row.rootKeyVersion,
        secretVersionId: row.id,
      }
    } catch (error) {
      const reason =
        error instanceof AiProviderSecretUnavailableError
          ? error.reason
          : 'authentication_failed'
      return {
        available: false,
        connectionId: row.connectionId,
        reason,
        rootKeyVersion: row.rootKeyVersion,
        secretVersionId: row.id,
      }
    }
  }) satisfies AiProviderSecretRestoreVerificationResult[]
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
