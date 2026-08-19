const UP_STATEMENTS = [
  `CREATE TABLE [ai_connections] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connections_id] DEFAULT NEWID(),
    [administration_name] nvarchar(200) NOT NULL,
    [public_name] nvarchar(200) NOT NULL,
    [description] nvarchar(max) NULL,
    [adapter_key] nvarchar(100) NOT NULL,
    [adapter_version] nvarchar(100) NOT NULL,
    [endpoint_url] nvarchar(2048) NOT NULL,
    [authentication_type] nvarchar(40) NOT NULL,
    [tls_policy_key] nvarchar(100) NOT NULL,
    [egress_policy_key] nvarchar(100) NOT NULL,
    [agent_runtime_key] nvarchar(100) NULL,
    [agent_runtime_version] nvarchar(100) NULL,
    [data_policy_summary] nvarchar(1000) NOT NULL,
    [lifecycle_status] nvarchar(40) NOT NULL,
    [configuration_version] int NOT NULL CONSTRAINT [df_ai_connections_configuration_version] DEFAULT (1),
    [maximum_concurrency] int NOT NULL CONSTRAINT [df_ai_connections_maximum_concurrency] DEFAULT (4),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connections_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_connections] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_connections_lifecycle_status] CHECK ([lifecycle_status] IN (N'draft', N'verification_required', N'active', N'suspended', N'retired')),
    CONSTRAINT [chk_ai_connections_authentication_type] CHECK ([authentication_type] IN (N'none', N'static_secret', N'oauth2_client_credentials', N'mtls')),
    CONSTRAINT [chk_ai_connections_configuration_version] CHECK ([configuration_version] >= 1),
    CONSTRAINT [chk_ai_connections_maximum_concurrency] CHECK ([maximum_concurrency] BETWEEN 1 AND 100),
    CONSTRAINT [chk_ai_connections_agent_runtime] CHECK (([agent_runtime_key] IS NULL AND [agent_runtime_version] IS NULL) OR ([agent_runtime_key] IS NOT NULL AND [agent_runtime_version] IS NOT NULL))
  );`,
  `CREATE UNIQUE INDEX [uq_ai_connections_administration_name]
    ON [ai_connections] ([administration_name]);`,
  `CREATE INDEX [idx_ai_connections_lifecycle_status]
    ON [ai_connections] ([lifecycle_status]);`,

  `CREATE TABLE [ai_connection_attestations] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_attestations_id] DEFAULT NEWID(),
    [ai_connection_id] uniqueidentifier NOT NULL,
    [revision_number] int NOT NULL,
    [status] nvarchar(32) NOT NULL,
    [responsible_organization_unit_reference] uniqueidentifier NULL,
    [purpose] nvarchar(max) NULL,
    [maximum_information_class] nvarchar(100) NULL,
    [is_personal_data_processed] bit NULL,
    [provider_name] nvarchar(300) NULL,
    [subprocessors_json] nvarchar(max) NULL,
    [processing_regions_json] nvarchar(max) NULL,
    [is_training_allowed] bit NULL,
    [maximum_retention_days] int NULL,
    [incident_response_reference] uniqueidentifier NULL,
    [decision_reference] nvarchar(1000) NULL,
    [reviewed_at] datetime2(3) NULL,
    [review_due_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_attestations_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_connection_attestations] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_connection_attestations_connection_revision] UNIQUE ([ai_connection_id], [revision_number]),
    CONSTRAINT [chk_ai_connection_attestations_revision_number] CHECK ([revision_number] >= 1),
    CONSTRAINT [chk_ai_connection_attestations_status] CHECK ([status] IN (N'draft', N'valid', N'superseded', N'expired', N'revoked')),
    CONSTRAINT [chk_ai_connection_attestations_subprocessors_json] CHECK ([subprocessors_json] IS NULL OR ISJSON([subprocessors_json]) = 1),
    CONSTRAINT [chk_ai_connection_attestations_processing_regions_json] CHECK ([processing_regions_json] IS NULL OR ISJSON([processing_regions_json]) = 1),
    CONSTRAINT [chk_ai_connection_attestations_retention] CHECK ([maximum_retention_days] IS NULL OR [maximum_retention_days] >= 0),
    CONSTRAINT [chk_ai_connection_attestations_valid_fields] CHECK ([status] <> N'valid' OR ([responsible_organization_unit_reference] IS NOT NULL AND [purpose] IS NOT NULL AND [maximum_information_class] IS NOT NULL AND [is_personal_data_processed] IS NOT NULL AND [provider_name] IS NOT NULL AND [subprocessors_json] IS NOT NULL AND [processing_regions_json] IS NOT NULL AND [is_training_allowed] IS NOT NULL AND [maximum_retention_days] IS NOT NULL AND [incident_response_reference] IS NOT NULL AND [decision_reference] IS NOT NULL AND [reviewed_at] IS NOT NULL))
  );`,
  `ALTER TABLE [ai_connection_attestations] ADD CONSTRAINT [fk_ai_connection_attestations_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_connection_attestations_valid_connection]
    ON [ai_connection_attestations] ([ai_connection_id]) WHERE [status] = N'valid';`,
  `CREATE INDEX [idx_ai_connection_attestations_review_due_at]
    ON [ai_connection_attestations] ([review_due_at]);`,

  `CREATE TABLE [ai_connection_verification_evidence] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_verification_evidence_id] DEFAULT NEWID(),
    [ai_connection_id] uniqueidentifier NOT NULL,
    [connection_configuration_version] int NOT NULL,
    [outcome] nvarchar(24) NOT NULL,
    [test_suite_version] nvarchar(100) NOT NULL,
    [adapter_version] nvarchar(100) NOT NULL,
    [agent_runtime_version] nvarchar(100) NULL,
    [configuration_fingerprint] char(64) NOT NULL,
    [failure_category] nvarchar(80) NULL,
    [details_json] nvarchar(max) NOT NULL,
    [verified_at] datetime2(3) NOT NULL,
    [expires_at] datetime2(3) NULL,
    CONSTRAINT [pk_ai_connection_verification_evidence] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_connection_verification_evidence_configuration_version] CHECK ([connection_configuration_version] >= 1),
    CONSTRAINT [chk_ai_connection_verification_evidence_outcome] CHECK ([outcome] IN (N'passed', N'failed')),
    CONSTRAINT [chk_ai_connection_verification_evidence_fingerprint] CHECK ([configuration_fingerprint] NOT LIKE '%[^0-9a-f]%'),
    CONSTRAINT [chk_ai_connection_verification_evidence_details_json] CHECK (ISJSON([details_json]) = 1),
    CONSTRAINT [chk_ai_connection_verification_evidence_expiry] CHECK ([expires_at] IS NULL OR [expires_at] > [verified_at])
  );`,
  `ALTER TABLE [ai_connection_verification_evidence] ADD CONSTRAINT [fk_ai_connection_verification_evidence_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_ai_connection_verification_evidence_connection_version]
    ON [ai_connection_verification_evidence] ([ai_connection_id], [connection_configuration_version], [verified_at]);`,

  `CREATE TABLE [ai_connection_models] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_models_id] DEFAULT NEWID(),
    [ai_connection_id] uniqueidentifier NOT NULL,
    [name] nvarchar(300) NOT NULL,
    [description] nvarchar(max) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_models_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_connection_models] PRIMARY KEY ([id])
  );`,
  `ALTER TABLE [ai_connection_models] ADD CONSTRAINT [fk_ai_connection_models_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_ai_connection_models_ai_connection_id]
    ON [ai_connection_models] ([ai_connection_id]);`,

  `CREATE TABLE [ai_connection_model_revisions] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_revisions_id] DEFAULT NEWID(),
    [ai_connection_model_id] uniqueidentifier NOT NULL,
    [revision_number] int NOT NULL,
    [connection_configuration_version] int NOT NULL,
    [status] nvarchar(40) NOT NULL,
    [external_model_id] nvarchar(450) NOT NULL,
    [external_model_version] nvarchar(200) NULL,
    [agent_runtime_version] nvarchar(100) NULL,
    [declared_capabilities_json] nvarchar(max) NOT NULL,
    [discovered_capabilities_json] nvarchar(max) NULL,
    [verified_capabilities_json] nvarchar(max) NULL,
    [verified_at] datetime2(3) NULL,
    [retired_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_revisions_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_connection_model_revisions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_connection_model_revisions_model_revision] UNIQUE ([ai_connection_model_id], [revision_number]),
    CONSTRAINT [chk_ai_connection_model_revisions_revision_number] CHECK ([revision_number] >= 1),
    CONSTRAINT [chk_ai_connection_model_revisions_configuration_version] CHECK ([connection_configuration_version] >= 1),
    CONSTRAINT [chk_ai_connection_model_revisions_status] CHECK ([status] IN (N'draft', N'verification_required', N'verified', N'retired')),
    CONSTRAINT [chk_ai_connection_model_revisions_declared_capabilities_json] CHECK (ISJSON([declared_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_revisions_discovered_capabilities_json] CHECK ([discovered_capabilities_json] IS NULL OR ISJSON([discovered_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_revisions_verified_capabilities_json] CHECK ([verified_capabilities_json] IS NULL OR ISJSON([verified_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_revisions_verified_fields] CHECK ([status] <> N'verified' OR ([verified_capabilities_json] IS NOT NULL AND [verified_at] IS NOT NULL)),
    CONSTRAINT [chk_ai_connection_model_revisions_retired_at] CHECK (([status] = N'retired' AND [retired_at] IS NOT NULL) OR ([status] <> N'retired' AND [retired_at] IS NULL))
  );`,
  `ALTER TABLE [ai_connection_model_revisions] ADD CONSTRAINT [fk_ai_connection_model_revisions_ai_connection_model_id] FOREIGN KEY ([ai_connection_model_id]) REFERENCES [ai_connection_models] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_ai_connection_model_revisions_status]
    ON [ai_connection_model_revisions] ([status]);`,
  `CREATE TRIGGER [trg_ai_connection_model_revisions_immutable]
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
      IF UPDATE([ai_connection_model_id]) OR UPDATE([revision_number]) OR UPDATE([connection_configuration_version]) OR UPDATE([external_model_id]) OR UPDATE([external_model_version]) OR UPDATE([agent_runtime_version]) OR UPDATE([declared_capabilities_json]) OR UPDATE([discovered_capabilities_json]) OR UPDATE([verified_capabilities_json])
        THROW 51060, 'AI connection model revision content is immutable; create a new revision.', 1;
    END;`,
  `CREATE TRIGGER [trg_ai_connection_model_revisions_delete_drafts_only]
    ON [ai_connection_model_revisions]
    AFTER DELETE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF EXISTS (SELECT 1 FROM [deleted] WHERE [status] <> N'draft')
        THROW 51063, 'Only unused AI connection model revision drafts may be deleted.', 1;
    END;`,

  `CREATE TABLE [ai_connection_model_verification_evidence] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_verification_evidence_id] DEFAULT NEWID(),
    [ai_connection_model_revision_id] uniqueidentifier NOT NULL,
    [ai_connection_verification_evidence_id] uniqueidentifier NOT NULL,
    [outcome] nvarchar(24) NOT NULL,
    [test_suite_version] nvarchar(100) NOT NULL,
    [verified_capabilities_json] nvarchar(max) NOT NULL,
    [evidence_fingerprint] char(64) NOT NULL,
    [failure_category] nvarchar(80) NULL,
    [details_json] nvarchar(max) NOT NULL,
    [verified_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_ai_connection_model_verification_evidence] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_outcome] CHECK ([outcome] IN (N'passed', N'failed')),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_capabilities_json] CHECK (ISJSON([verified_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_fingerprint] CHECK ([evidence_fingerprint] NOT LIKE '%[^0-9a-f]%'),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_details_json] CHECK (ISJSON([details_json]) = 1)
  );`,
  `ALTER TABLE [ai_connection_model_verification_evidence] ADD CONSTRAINT [fk_ai_connection_model_verification_evidence_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [ai_connection_model_verification_evidence] ADD CONSTRAINT [fk_ai_connection_model_verification_evidence_ai_connection_verification_evidence_id] FOREIGN KEY ([ai_connection_verification_evidence_id]) REFERENCES [ai_connection_verification_evidence] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_ai_connection_model_verification_evidence_revision]
    ON [ai_connection_model_verification_evidence] ([ai_connection_model_revision_id], [verified_at]);`,

  `CREATE TABLE [ai_run_profiles] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_profiles_id] DEFAULT NEWID(),
    [profile_key] nvarchar(80) NOT NULL,
    [operational_status] nvarchar(24) NOT NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_profiles_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_run_profiles] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_run_profiles_profile_key] CHECK ([profile_key] IN (N'generation_without_images', N'generation_with_images', N'invalid_json_repair')),
    CONSTRAINT [chk_ai_run_profiles_operational_status] CHECK ([operational_status] IN (N'enabled', N'suspended'))
  );`,
  `CREATE UNIQUE INDEX [uq_ai_run_profiles_profile_key]
    ON [ai_run_profiles] ([profile_key]);`,

  `CREATE TABLE [ai_run_profile_revisions] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_profile_revisions_id] DEFAULT NEWID(),
    [ai_run_profile_id] uniqueidentifier NOT NULL,
    [ai_connection_model_revision_id] uniqueidentifier NULL,
    [revision_number] int NOT NULL,
    [status] nvarchar(24) NOT NULL,
    [capability_policy_json] nvarchar(max) NOT NULL,
    [total_time_budget_seconds] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_total_time_budget_seconds] DEFAULT (1200),
    [inactivity_time_budget_seconds] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_inactivity_time_budget_seconds] DEFAULT (300),
    [queue_capacity] int NOT NULL CONSTRAINT [df_ai_run_profile_revisions_queue_capacity] DEFAULT (10),
    [created_at] datetime2(3) NOT NULL,
    [activated_at] datetime2(3) NULL,
    [superseded_at] datetime2(3) NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_profile_revisions_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_run_profile_revisions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_run_profile_revisions_profile_revision] UNIQUE ([ai_run_profile_id], [revision_number]),
    CONSTRAINT [chk_ai_run_profile_revisions_revision_number] CHECK ([revision_number] >= 1),
    CONSTRAINT [chk_ai_run_profile_revisions_status] CHECK ([status] IN (N'draft', N'active', N'superseded')),
    CONSTRAINT [chk_ai_run_profile_revisions_capability_policy_json] CHECK (ISJSON([capability_policy_json]) = 1),
    CONSTRAINT [chk_ai_run_profile_revisions_total_time_budget] CHECK ([total_time_budget_seconds] BETWEEN 300 AND 3600),
    CONSTRAINT [chk_ai_run_profile_revisions_inactivity_time_budget] CHECK ([inactivity_time_budget_seconds] BETWEEN 300 AND [total_time_budget_seconds]),
    CONSTRAINT [chk_ai_run_profile_revisions_queue_capacity] CHECK ([queue_capacity] BETWEEN 0 AND 100),
    CONSTRAINT [chk_ai_run_profile_revisions_model_required] CHECK ([status] = N'draft' OR [ai_connection_model_revision_id] IS NOT NULL),
    CONSTRAINT [chk_ai_run_profile_revisions_lifecycle_dates] CHECK (([status] = N'draft' AND [activated_at] IS NULL AND [superseded_at] IS NULL) OR ([status] = N'active' AND [activated_at] IS NOT NULL AND [superseded_at] IS NULL) OR ([status] = N'superseded' AND [activated_at] IS NOT NULL AND [superseded_at] IS NOT NULL))
  );`,
  `ALTER TABLE [ai_run_profile_revisions] ADD CONSTRAINT [fk_ai_run_profile_revisions_ai_run_profile_id] FOREIGN KEY ([ai_run_profile_id]) REFERENCES [ai_run_profiles] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [ai_run_profile_revisions] ADD CONSTRAINT [fk_ai_run_profile_revisions_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_run_profile_revisions_active_profile]
    ON [ai_run_profile_revisions] ([ai_run_profile_id]) WHERE [status] = N'active';`,
  `CREATE UNIQUE INDEX [uq_ai_run_profile_revisions_draft_profile]
    ON [ai_run_profile_revisions] ([ai_run_profile_id]) WHERE [status] = N'draft';`,
  `CREATE INDEX [idx_ai_run_profile_revisions_model_revision]
    ON [ai_run_profile_revisions] ([ai_connection_model_revision_id]);`,
  `CREATE TRIGGER [trg_ai_run_profile_revisions_immutable]
    ON [ai_run_profile_revisions]
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
        THROW 51066, 'AI run profile revisions cannot return to draft.', 1;
      IF UPDATE([ai_run_profile_id]) OR UPDATE([revision_number]) OR (
        (UPDATE([ai_connection_model_revision_id]) OR UPDATE([capability_policy_json]) OR UPDATE([total_time_budget_seconds]) OR UPDATE([inactivity_time_budget_seconds]) OR UPDATE([queue_capacity]))
        AND EXISTS (
            SELECT 1
            FROM [inserted] AS [i]
            INNER JOIN [deleted] AS [d] ON [d].[id] = [i].[id]
            WHERE [d].[status] <> N'draft' OR [i].[status] <> N'draft'
          )
      )
        THROW 51061, 'AI run profile revision content is immutable; create a new revision.', 1;
    END;`,
  `CREATE TRIGGER [trg_ai_run_profile_revisions_delete_drafts_only]
    ON [ai_run_profile_revisions]
    AFTER DELETE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF EXISTS (SELECT 1 FROM [deleted] WHERE [status] <> N'draft')
        THROW 51064, 'Only AI run profile revision drafts may be deleted.', 1;
    END;`,

  `CREATE TABLE [ai_connection_model_operational_states] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_id] DEFAULT NEWID(),
    [ai_connection_model_revision_id] uniqueidentifier NOT NULL,
    [health_status] nvarchar(24) NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_health_status] DEFAULT (N'unknown'),
    [circuit_breaker_status] nvarchar(24) NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_breaker_status] DEFAULT (N'closed'),
    [consecutive_failure_count] int NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_failure_count] DEFAULT (0),
    [automatic_recovery_attempt_count] int NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_recovery_count] DEFAULT (0),
    [is_manual_recovery_required] bit NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_manual_recovery] DEFAULT (0),
    [last_health_evidence_at] datetime2(3) NULL,
    [circuit_opened_at] datetime2(3) NULL,
    [next_recovery_at] datetime2(3) NULL,
    [lease_owner_id] uniqueidentifier NULL,
    [lease_run_id] uniqueidentifier NULL,
    [lease_expires_at] datetime2(3) NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_connection_model_operational_states] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_connection_model_operational_states_health_status] CHECK ([health_status] IN (N'unknown', N'healthy', N'degraded', N'unavailable')),
    CONSTRAINT [chk_ai_connection_model_operational_states_breaker_status] CHECK ([circuit_breaker_status] IN (N'closed', N'open', N'half_open')),
    CONSTRAINT [chk_ai_connection_model_operational_states_failure_count] CHECK ([consecutive_failure_count] BETWEEN 0 AND 5),
    CONSTRAINT [chk_ai_connection_model_operational_states_recovery_count] CHECK ([automatic_recovery_attempt_count] BETWEEN 0 AND 5),
    CONSTRAINT [chk_ai_connection_model_operational_states_lease] CHECK (([lease_owner_id] IS NULL AND [lease_run_id] IS NULL AND [lease_expires_at] IS NULL) OR ([lease_owner_id] IS NOT NULL AND [lease_run_id] IS NOT NULL AND [lease_expires_at] IS NOT NULL))
  );`,
  `ALTER TABLE [ai_connection_model_operational_states] ADD CONSTRAINT [fk_ai_connection_model_operational_states_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_connection_model_operational_states_revision]
    ON [ai_connection_model_operational_states] ([ai_connection_model_revision_id]);`,
  `CREATE INDEX [idx_ai_connection_model_operational_states_recovery]
    ON [ai_connection_model_operational_states] ([circuit_breaker_status], [next_recovery_at]);`,
  `CREATE INDEX [idx_ai_connection_model_operational_states_lease_expires_at]
    ON [ai_connection_model_operational_states] ([lease_expires_at]);`,

  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
    THROW 51062, 'Runtime permission role is missing.', 1;
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connections] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_attestations] TO [kravhantering_runtime];
  GRANT SELECT, INSERT ON OBJECT::[dbo].[ai_connection_verification_evidence] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_models] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_model_revisions] TO [kravhantering_runtime];
  GRANT SELECT, INSERT ON OBJECT::[dbo].[ai_connection_model_verification_evidence] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ai_run_profiles] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_run_profile_revisions] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_model_operational_states] TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_connection_model_operational_states', N'U') IS NOT NULL DROP TABLE [ai_connection_model_operational_states];`,
  `IF OBJECT_ID(N'ai_run_profile_revisions', N'U') IS NOT NULL DROP TABLE [ai_run_profile_revisions];`,
  `IF OBJECT_ID(N'ai_run_profiles', N'U') IS NOT NULL DROP TABLE [ai_run_profiles];`,
  `IF OBJECT_ID(N'ai_connection_model_verification_evidence', N'U') IS NOT NULL DROP TABLE [ai_connection_model_verification_evidence];`,
  `IF OBJECT_ID(N'ai_connection_model_revisions', N'U') IS NOT NULL DROP TABLE [ai_connection_model_revisions];`,
  `IF OBJECT_ID(N'ai_connection_models', N'U') IS NOT NULL DROP TABLE [ai_connection_models];`,
  `IF OBJECT_ID(N'ai_connection_verification_evidence', N'U') IS NOT NULL DROP TABLE [ai_connection_verification_evidence];`,
  `IF OBJECT_ID(N'ai_connection_attestations', N'U') IS NOT NULL DROP TABLE [ai_connection_attestations];`,
  `IF OBJECT_ID(N'ai_connections', N'U') IS NOT NULL DROP TABLE [ai_connections];`,
]

export class AiConnectionsDataModel1720700000000 {
  name = 'AiConnectionsDataModel1720700000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiConnectionsDataModel1720700000000
