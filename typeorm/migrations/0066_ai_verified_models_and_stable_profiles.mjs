const UP_STATEMENTS = [
  `ALTER TABLE [ai_run_profiles] ADD
    [ai_connection_model_revision_id] uniqueidentifier NULL,
    [configuration_version] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_configuration_version] DEFAULT (1),
    [total_time_budget_seconds] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_total_time_budget_seconds] DEFAULT (1200),
    [inactivity_time_budget_seconds] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_inactivity_time_budget_seconds] DEFAULT (300),
    [queue_capacity] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_queue_capacity] DEFAULT (10),
    [maximum_output_tokens] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_maximum_output_tokens] DEFAULT (8192),
    [maximum_output_bytes] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_maximum_output_bytes] DEFAULT (4194304),
    [maximum_retained_memory_bytes] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_maximum_retained_memory_bytes] DEFAULT (8388608),
    [maximum_buffered_events] int NOT NULL
      CONSTRAINT [df_ai_run_profiles_maximum_buffered_events] DEFAULT (32);`,
  `UPDATE [profile]
   SET [ai_connection_model_revision_id]
       = [selected].[ai_connection_model_revision_id],
     [total_time_budget_seconds] = [selected].[total_time_budget_seconds],
     [inactivity_time_budget_seconds]
       = [selected].[inactivity_time_budget_seconds],
     [queue_capacity] = [selected].[queue_capacity],
     [maximum_output_tokens] = [selected].[maximum_output_tokens],
     [maximum_output_bytes] = [selected].[maximum_output_bytes],
     [maximum_retained_memory_bytes]
       = [selected].[maximum_retained_memory_bytes],
     [maximum_buffered_events] = [selected].[maximum_buffered_events]
   FROM [ai_run_profiles] AS [profile]
   CROSS APPLY (
     SELECT TOP (1) [revision].*
     FROM [ai_run_profile_revisions] AS [revision]
     WHERE [revision].[ai_run_profile_id] = [profile].[id]
     ORDER BY CASE [revision].[status]
       WHEN N'active' THEN 0 WHEN N'draft' THEN 1 ELSE 2 END,
       [revision].[revision_number] DESC
   ) AS [selected];`,
  `ALTER TABLE [ai_run_profiles] ADD CONSTRAINT [fk_ai_run_profiles_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_ai_run_profiles_ai_connection_model_revision_id]
    ON [ai_run_profiles] ([ai_connection_model_revision_id]);`,
  `ALTER TABLE [ai_run_profiles] ADD
    CONSTRAINT [chk_ai_run_profiles_configuration_version]
      CHECK ([configuration_version] >= 1),
    CONSTRAINT [chk_ai_run_profiles_total_time_budget_seconds]
      CHECK ([total_time_budget_seconds] BETWEEN 300 AND 3600),
    CONSTRAINT [chk_ai_run_profiles_inactivity_time_budget_seconds]
      CHECK ([inactivity_time_budget_seconds]
        BETWEEN 300 AND [total_time_budget_seconds]),
    CONSTRAINT [chk_ai_run_profiles_queue_capacity]
      CHECK ([queue_capacity] BETWEEN 0 AND 100),
    CONSTRAINT [chk_ai_run_profiles_maximum_output_tokens]
      CHECK ([maximum_output_tokens] BETWEEN 1 AND 1000000),
    CONSTRAINT [chk_ai_run_profiles_maximum_output_bytes]
      CHECK ([maximum_output_bytes] BETWEEN 1 AND 67108864),
    CONSTRAINT [chk_ai_run_profiles_maximum_retained_memory_bytes]
      CHECK ([maximum_retained_memory_bytes] BETWEEN 1 AND 134217728),
    CONSTRAINT [chk_ai_run_profiles_maximum_buffered_events]
      CHECK ([maximum_buffered_events] BETWEEN 1 AND 1024);`,
  `ALTER TABLE [ai_run_coordination_entries]
    DROP CONSTRAINT
      [fk_ai_run_coordination_entries_ai_run_profile_revision_id];`,
  `ALTER TABLE [ai_run_coordination_entries] ADD
    [ai_run_profile_id] uniqueidentifier NULL,
    [ai_run_profile_configuration_version] int NULL;`,
  `UPDATE [entry]
   SET [ai_run_profile_id] = [revision].[ai_run_profile_id],
     [ai_run_profile_configuration_version] = 1
   FROM [ai_run_coordination_entries] AS [entry]
   INNER JOIN [ai_run_profile_revisions] AS [revision]
     ON [revision].[id] = [entry].[ai_run_profile_revision_id];`,
  `ALTER TABLE [ai_run_coordination_entries]
    ALTER COLUMN [ai_run_profile_id] uniqueidentifier NOT NULL;`,
  `ALTER TABLE [ai_run_coordination_entries]
    ALTER COLUMN [ai_run_profile_configuration_version] int NOT NULL;`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_run_profile_id] FOREIGN KEY ([ai_run_profile_id]) REFERENCES [ai_run_profiles] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [chk_ai_run_coordination_entries_profile_configuration_version]
    CHECK ([ai_run_profile_configuration_version] >= 1);`,
  `CREATE INDEX [idx_ai_run_coordination_entries_ai_run_profile_id_ai_run_profile_configuration_version]
    ON [ai_run_coordination_entries]
      ([ai_run_profile_id], [ai_run_profile_configuration_version]);`,
  `ALTER TABLE [ai_run_coordination_entries]
    DROP COLUMN [ai_run_profile_revision_id];`,
  `DROP TRIGGER IF EXISTS [trg_ai_run_profile_revisions_runtime_limits_immutable];
   DROP TRIGGER IF EXISTS [trg_ai_run_profile_revisions_delete_drafts_only];
   DROP TRIGGER IF EXISTS [trg_ai_run_profile_revisions_immutable];
   DROP TABLE [ai_run_profile_revisions];`,
  `ALTER TABLE [ai_connection_model_verification_evidence] ADD
    [profile_compatibility_json] nvarchar(max) NULL;`,
  `UPDATE [ai_connection_model_verification_evidence]
   SET [profile_compatibility_json] = N'{}'
   WHERE [profile_compatibility_json] IS NULL;`,
  `ALTER TABLE [ai_connection_model_verification_evidence]
    ALTER COLUMN [profile_compatibility_json] nvarchar(max) NOT NULL;`,
  `ALTER TABLE [ai_connection_model_verification_evidence] ADD
    CONSTRAINT [chk_ai_connection_model_verification_evidence_profile_compatibility_json]
    CHECK (ISJSON([profile_compatibility_json]) = 1);`,
  `DROP TRIGGER IF EXISTS [trg_ai_connection_model_revisions_delete_drafts_only];
   DROP TRIGGER IF EXISTS [trg_ai_connection_model_revisions_runtime_limits_immutable];
   DROP TRIGGER IF EXISTS [trg_ai_connection_model_revisions_immutable];
   ALTER TABLE [ai_connection_model_revisions]
     DROP CONSTRAINT [chk_ai_connection_model_revisions_status],
       [chk_ai_connection_model_revisions_retired_at];`,
  `UPDATE [ai_connection_model_revisions]
   SET [status] = CASE
       WHEN [status] = N'verified' THEN N'new_revision_required'
       WHEN [status] = N'retired' THEN N'ended'
       ELSE N'new_revision_required'
     END,
     [verified_capabilities_json] = CASE
       WHEN [status] = N'verified' THEN [verified_capabilities_json]
       ELSE NULL END,
     [verified_at] = CASE WHEN [status] = N'verified' THEN [verified_at]
       ELSE NULL END;`,
  `EXEC sp_rename
    N'dbo.ai_connection_model_revisions.retired_at', N'ended_at', N'COLUMN';`,
  `ALTER TABLE [ai_connection_model_revisions] ADD
    CONSTRAINT [chk_ai_connection_model_revisions_status]
      CHECK ([status]
        IN (N'verified', N'new_revision_required', N'ended')),
    CONSTRAINT [chk_ai_connection_model_revisions_ended_at]
      CHECK (([status] = N'ended' AND [ended_at] IS NOT NULL)
        OR ([status] <> N'ended' AND [ended_at] IS NULL));`,
  `CREATE TRIGGER [trg_ai_connection_model_revisions_immutable]
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
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
     THROW 51222, 'Runtime permission role is missing.', 1;
   GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ai_run_profiles]
     TO [kravhantering_runtime];
   GRANT DELETE ON OBJECT::[dbo].[ai_connection_model_verification_evidence]
     TO [kravhantering_runtime];
   GRANT DELETE ON OBJECT::[dbo].[ai_connection_verification_evidence]
     TO [kravhantering_runtime];
   GRANT UPDATE ([cancellation_requested_at], [cancellation_reason])
     ON OBJECT::[dbo].[ai_run_coordination_entries]
     TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `THROW 51229,
    'Stable AI run-profile configuration cannot be rolled back without recreating retired profile revision history.',
    1;`,
]

export class AiVerifiedModelsAndStableProfiles1720800000005 {
  name = 'AiVerifiedModelsAndStableProfiles1720800000005'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiVerifiedModelsAndStableProfiles1720800000005
