const UP_STATEMENTS = [
  `ALTER TABLE [ai_connection_model_revisions] ADD [reasoning_json] nvarchar(200) NULL`,
  `ALTER TABLE [ai_connection_model_revisions] ADD CONSTRAINT [chk_ai_connection_model_revisions_reasoning_json] CHECK ([reasoning_json] IS NULL OR ISJSON([reasoning_json]) = 1)`,
  `UPDATE [ai_connection_model_revisions] SET [status] = N'new_revision_required', [revision_token] = NEWID(), [updated_at] = SYSUTCDATETIME() WHERE [status] = N'verified'`,
  `CREATE OR ALTER TRIGGER [trg_ai_connection_model_revisions_immutable]
    ON [ai_connection_model_revisions]
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF NOT EXISTS (SELECT 1 FROM [inserted]) RETURN;
      IF UPDATE([ai_connection_model_id]) OR UPDATE([revision_number])
        OR UPDATE([connection_configuration_version])
        OR UPDATE([external_model_id]) OR UPDATE([external_model_version])
        OR UPDATE([agent_runtime_version])
        OR UPDATE([declared_capabilities_json])
        OR UPDATE([discovered_capabilities_json])
        OR UPDATE([verified_capabilities_json])
        OR UPDATE([maximum_concurrency])
        OR UPDATE([reasoning_json])
        THROW 51220,
          'AI connection model revision content is immutable.', 1;
      IF EXISTS (
        SELECT 1 FROM [inserted] AS [i]
        INNER JOIN [deleted] AS [d] ON [d].[id] = [i].[id]
        WHERE [d].[status] = N'ended' AND [i].[status] <> N'ended'
      ) THROW 51221, 'Ended AI model revisions cannot be restored.', 1;
    END;`,
]
const DOWN_STATEMENTS = [
  `CREATE OR ALTER TRIGGER [trg_ai_connection_model_revisions_immutable]
    ON [ai_connection_model_revisions]
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF NOT EXISTS (SELECT 1 FROM [inserted]) RETURN;
      IF UPDATE([ai_connection_model_id]) OR UPDATE([revision_number])
        OR UPDATE([connection_configuration_version])
        OR UPDATE([external_model_id]) OR UPDATE([external_model_version])
        OR UPDATE([agent_runtime_version])
        OR UPDATE([declared_capabilities_json])
        OR UPDATE([discovered_capabilities_json])
        OR UPDATE([verified_capabilities_json])
        OR UPDATE([maximum_concurrency])
        THROW 51220,
          'AI connection model revision content is immutable.', 1;
      IF EXISTS (
        SELECT 1 FROM [inserted] AS [i]
        INNER JOIN [deleted] AS [d] ON [d].[id] = [i].[id]
        WHERE [d].[status] = N'ended' AND [i].[status] <> N'ended'
      ) THROW 51221, 'Ended AI model revisions cannot be restored.', 1;
    END;`,
  `ALTER TABLE [ai_connection_model_revisions] DROP CONSTRAINT [chk_ai_connection_model_revisions_reasoning_json]`,
  `ALTER TABLE [ai_connection_model_revisions] DROP COLUMN [reasoning_json]`,
]
export class AiModelReasoning1720900000000 {
  name = 'AiModelReasoning1720900000000'
  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }
  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiModelReasoning1720900000000
