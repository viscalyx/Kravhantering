import { EntitySchema } from 'typeorm'
import type { AiConnectionEntity } from './ai-connection'

export type AiProviderSecretVersionStatus =
  | 'active'
  | 'candidate'
  | 'superseded'

export interface AiProviderSecretVersionEntity {
  activatedAt: Date | null
  authenticationTag: Buffer | null
  cipherFormatVersion: number
  ciphertext: Buffer | null
  ciphertextDeletedAt: Date | null
  connection: AiConnectionEntity
  createdAt: Date
  deactivatedAt: Date | null
  id: string
  nonce: Buffer | null
  providerRevokedAt: Date | null
  revisionNumber: number
  revisionToken: string
  rootKeyVersion: string
  status: AiProviderSecretVersionStatus
  verifiedAt: Date | null
}

export const aiProviderSecretVersionEntity =
  new EntitySchema<AiProviderSecretVersionEntity>({
    name: 'AiProviderSecretVersion',
    tableName: 'ai_provider_secret_versions',
    columns: {
      id: { name: 'id', primary: true, type: 'uniqueidentifier' },
      revisionNumber: { name: 'revision_number', type: 'int' },
      status: { length: 24, name: 'status', type: 'nvarchar' },
      ciphertext: {
        length: 'MAX',
        name: 'ciphertext',
        nullable: true,
        type: 'varbinary',
      },
      nonce: { length: 12, name: 'nonce', nullable: true, type: 'binary' },
      authenticationTag: {
        length: 16,
        name: 'authentication_tag',
        nullable: true,
        type: 'binary',
      },
      cipherFormatVersion: {
        name: 'cipher_format_version',
        type: 'smallint',
      },
      rootKeyVersion: {
        length: 100,
        name: 'root_key_version',
        type: 'nvarchar',
      },
      createdAt: { name: 'created_at', precision: 3, type: 'datetime2' },
      verifiedAt: {
        name: 'verified_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      activatedAt: {
        name: 'activated_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      deactivatedAt: {
        name: 'deactivated_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      providerRevokedAt: {
        name: 'provider_revoked_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      ciphertextDeletedAt: {
        name: 'ciphertext_deleted_at',
        nullable: true,
        precision: 3,
        type: 'datetime2',
      },
      revisionToken: {
        default: () => 'NEWID()',
        name: 'revision_token',
        type: 'uniqueidentifier',
      },
    },
    relations: {
      connection: {
        joinColumn: {
          foreignKeyConstraintName:
            'fk_ai_provider_secret_versions_ai_connection_id',
          name: 'ai_connection_id',
          referencedColumnName: 'id',
        },
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        target: 'AiConnection',
        type: 'many-to-one',
      },
    },
    uniques: [
      {
        columns: ['connection', 'revisionNumber'],
        name: 'uq_ai_provider_secret_versions_connection_revision',
      },
    ],
    indices: [
      {
        columns: ['connection'],
        name: 'uq_ai_provider_secret_versions_active_connection',
        unique: true,
        where: "[status] = N'active'",
      },
      {
        columns: ['rootKeyVersion'],
        name: 'idx_ai_provider_secret_versions_root_key_version',
        where: '[ciphertext] IS NOT NULL',
      },
    ],
    checks: [
      {
        expression: '[revision_number] >= 1',
        name: 'chk_ai_provider_secret_versions_revision_number',
      },
      {
        expression: "[status] IN (N'candidate', N'active', N'superseded')",
        name: 'chk_ai_provider_secret_versions_status',
      },
      {
        expression: '[cipher_format_version] = 1',
        name: 'chk_ai_provider_secret_versions_cipher_format',
      },
      {
        expression:
          '([ciphertext] IS NOT NULL AND [nonce] IS NOT NULL AND [authentication_tag] IS NOT NULL AND [ciphertext_deleted_at] IS NULL) OR ([ciphertext] IS NULL AND [nonce] IS NULL AND [authentication_tag] IS NULL AND [ciphertext_deleted_at] IS NOT NULL)',
        name: 'chk_ai_provider_secret_versions_encrypted_material',
      },
      {
        expression:
          "([status] = N'candidate' AND [verified_at] IS NULL AND [activated_at] IS NULL AND [deactivated_at] IS NULL) OR ([status] = N'active' AND [verified_at] IS NOT NULL AND [activated_at] IS NOT NULL AND [deactivated_at] IS NULL) OR ([status] = N'superseded' AND [verified_at] IS NOT NULL AND [activated_at] IS NOT NULL AND [deactivated_at] IS NOT NULL)",
        name: 'chk_ai_provider_secret_versions_lifecycle',
      },
      {
        expression:
          "([provider_revoked_at] IS NULL AND [ciphertext_deleted_at] IS NULL) OR ([status] = N'superseded' AND [provider_revoked_at] IS NOT NULL AND [ciphertext_deleted_at] IS NOT NULL AND [provider_revoked_at] = [ciphertext_deleted_at])",
        name: 'chk_ai_provider_secret_versions_revocation',
      },
    ],
  })
