const IMMUTABLE_TRIGGER = `CREATE OR ALTER TRIGGER [trg_ai_connection_model_revisions_immutable]
  ON [ai_connection_model_revisions]
  AFTER UPDATE
  AS
  BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
      SELECT 1
      FROM [inserted] AS [i]
      INNER JOIN [deleted] AS [d] ON [d].[id] = [i].[id]
      WHERE [d].[status] <> N'draft' AND [i].[status] = N'draft'
    )
      THROW 51065, 'AI connection model revisions cannot return to draft.', 1;
    IF UPDATE([ai_connection_model_id]) OR UPDATE([revision_number])
      OR UPDATE([connection_configuration_version])
      OR UPDATE([external_model_id]) OR UPDATE([external_model_version])
      OR UPDATE([agent_runtime_version])
      OR UPDATE([declared_capabilities_json])
      OR UPDATE([discovered_capabilities_json])
      THROW 51060, 'AI connection model revision content is immutable; create a new revision.', 1;
  END;`

const PREVIOUS_TRIGGER = IMMUTABLE_TRIGGER.replace(
  'OR UPDATE([discovered_capabilities_json])',
  'OR UPDATE([discovered_capabilities_json])\n      OR UPDATE([verified_capabilities_json])',
)

const UP_STATEMENTS = [IMMUTABLE_TRIGGER]
const DOWN_STATEMENTS = [PREVIOUS_TRIGGER]

export class AiModelRevisionLifecycle1720800000002 {
  name = 'AiModelRevisionLifecycle1720800000002'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiModelRevisionLifecycle1720800000002
