const UP_STATEMENTS = [
  `CREATE TABLE [ai_provider_secret_versions] (
    [id] uniqueidentifier NOT NULL,
    [ai_connection_id] uniqueidentifier NOT NULL,
    [revision_number] int NOT NULL,
    [status] nvarchar(24) NOT NULL,
    [ciphertext] varbinary(max) NULL,
    [nonce] binary(12) NULL,
    [authentication_tag] binary(16) NULL,
    [cipher_format_version] smallint NOT NULL,
    [root_key_version] nvarchar(100) NOT NULL,
    [created_at] datetime2(3) NOT NULL,
    [verified_at] datetime2(3) NULL,
    [activated_at] datetime2(3) NULL,
    [deactivated_at] datetime2(3) NULL,
    [provider_revoked_at] datetime2(3) NULL,
    [ciphertext_deleted_at] datetime2(3) NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_provider_secret_versions_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_provider_secret_versions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_provider_secret_versions_connection_revision] UNIQUE ([ai_connection_id], [revision_number]),
    CONSTRAINT [chk_ai_provider_secret_versions_revision_number] CHECK ([revision_number] >= 1),
    CONSTRAINT [chk_ai_provider_secret_versions_status] CHECK ([status] IN (N'candidate', N'active', N'superseded')),
    CONSTRAINT [chk_ai_provider_secret_versions_cipher_format] CHECK ([cipher_format_version] = 1),
    CONSTRAINT [chk_ai_provider_secret_versions_encrypted_material] CHECK (([ciphertext] IS NOT NULL AND [nonce] IS NOT NULL AND [authentication_tag] IS NOT NULL AND [ciphertext_deleted_at] IS NULL) OR ([ciphertext] IS NULL AND [nonce] IS NULL AND [authentication_tag] IS NULL AND [ciphertext_deleted_at] IS NOT NULL)),
    CONSTRAINT [chk_ai_provider_secret_versions_lifecycle] CHECK (([status] = N'candidate' AND [verified_at] IS NULL AND [activated_at] IS NULL AND [deactivated_at] IS NULL) OR ([status] = N'active' AND [verified_at] IS NOT NULL AND [activated_at] IS NOT NULL AND [deactivated_at] IS NULL) OR ([status] = N'superseded' AND [verified_at] IS NOT NULL AND [activated_at] IS NOT NULL AND [deactivated_at] IS NOT NULL)),
    CONSTRAINT [chk_ai_provider_secret_versions_revocation] CHECK (([provider_revoked_at] IS NULL AND [ciphertext_deleted_at] IS NULL) OR ([status] = N'superseded' AND [provider_revoked_at] IS NOT NULL AND [ciphertext_deleted_at] IS NOT NULL AND [provider_revoked_at] = [ciphertext_deleted_at]))
  );`,
  `ALTER TABLE [ai_provider_secret_versions] ADD CONSTRAINT [fk_ai_provider_secret_versions_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_provider_secret_versions_active_connection]
    ON [ai_provider_secret_versions] ([ai_connection_id])
    WHERE [status] = N'active';`,
  `CREATE INDEX [idx_ai_provider_secret_versions_root_key_version]
    ON [ai_provider_secret_versions] ([root_key_version])
    WHERE [ciphertext] IS NOT NULL;`,
  `CREATE TRIGGER [trg_ai_provider_secret_versions_immutable_binding]
    ON [ai_provider_secret_versions]
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF UPDATE([ai_connection_id]) OR UPDATE([revision_number]) OR UPDATE([created_at])
        THROW 51102, 'AI provider-secret immutable binding metadata cannot be changed.', 1;
    END;`,
  `CREATE TRIGGER [trg_ai_provider_secret_versions_delete_candidates_only]
    ON [ai_provider_secret_versions]
    AFTER DELETE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF EXISTS (SELECT 1 FROM [deleted] WHERE [status] <> N'candidate')
        THROW 51104, 'Only AI provider-secret candidates may be deleted; superseded ciphertext must be scrubbed while metadata is preserved.', 1;
    END;`,
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
    THROW 51103, 'Runtime permission role is missing.', 1;
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_provider_secret_versions] TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_provider_secret_versions', N'U') IS NOT NULL DROP TABLE [ai_provider_secret_versions];`,
]

export class AiProviderSecrets1720800000000 {
  name = 'AiProviderSecrets1720800000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiProviderSecrets1720800000000
