const UP_STATEMENTS = [
  `ALTER TABLE [ai_provider_secret_versions] ADD [credential_purpose] nvarchar(24) NOT NULL CONSTRAINT [df_ai_provider_secret_versions_credential_purpose] DEFAULT N'runtime';`,
  `ALTER TABLE [ai_provider_secret_versions] ADD CONSTRAINT [chk_ai_provider_secret_versions_credential_purpose] CHECK ([credential_purpose] IN (N'runtime', N'management'));`,
  `DROP INDEX [uq_ai_provider_secret_versions_active_connection] ON [ai_provider_secret_versions];`,
  `ALTER TABLE [ai_provider_secret_versions] DROP CONSTRAINT [uq_ai_provider_secret_versions_connection_revision];`,
  `ALTER TABLE [ai_provider_secret_versions] ADD CONSTRAINT [uq_ai_provider_secret_versions_connection_revision] UNIQUE ([ai_connection_id], [credential_purpose], [revision_number]);`,
  `CREATE UNIQUE INDEX [uq_ai_provider_secret_versions_active_connection] ON [ai_provider_secret_versions] ([ai_connection_id], [credential_purpose]) WHERE [status] = N'active';`,
  `ALTER TABLE [ai_provider_secret_versions] DROP CONSTRAINT [chk_ai_provider_secret_versions_revocation];`,
  `ALTER TABLE [ai_provider_secret_versions] ADD CONSTRAINT [chk_ai_provider_secret_versions_revocation] CHECK (
    ([provider_revoked_at] IS NULL AND [ciphertext_deleted_at] IS NULL) OR
    ([status] = N'superseded' AND [ciphertext_deleted_at] IS NOT NULL AND (
      ([credential_purpose] = N'management' AND [provider_revoked_at] IS NULL) OR
      ([provider_revoked_at] IS NOT NULL AND [provider_revoked_at] = [ciphertext_deleted_at])
    ))
  );`,
  `CREATE OR ALTER TRIGGER [trg_ai_provider_secret_versions_immutable_binding]
    ON [ai_provider_secret_versions] AFTER UPDATE AS
    BEGIN
      SET NOCOUNT ON;
      IF UPDATE([id]) OR UPDATE([ai_connection_id]) OR UPDATE([revision_number]) OR UPDATE([created_at]) OR UPDATE([credential_purpose])
        THROW 51102, 'AI provider-secret immutable binding metadata cannot be changed.', 1;
    END;`,
]

export class AiManagementCredentials1721100000000 {
  name = 'AiManagementCredentials1721100000000'
  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }
  async down(queryRunner) {
    await queryRunner.query(
      "THROW 51105, 'Management credential purpose cannot be removed safely. Restore a compatible backup and keyring.', 1;",
    )
  }
}
export default AiManagementCredentials1721100000000
