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
    [deleted_at] datetime2(3) NULL,
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
    [maximum_concurrency] int NULL,
    [agent_runtime_version] nvarchar(100) NULL,
    [declared_capabilities_json] nvarchar(max) NOT NULL,
    [discovered_capabilities_json] nvarchar(max) NULL,
    [verified_capabilities_json] nvarchar(max) NULL,
    [verified_at] datetime2(3) NULL,
    [ended_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_revisions_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_connection_model_revisions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_connection_model_revisions_model_revision] UNIQUE ([ai_connection_model_id], [revision_number]),
    CONSTRAINT [chk_ai_connection_model_revisions_revision_number] CHECK ([revision_number] >= 1),
    CONSTRAINT [chk_ai_connection_model_revisions_configuration_version] CHECK ([connection_configuration_version] >= 1),
    CONSTRAINT [chk_ai_connection_model_revisions_maximum_concurrency] CHECK ([maximum_concurrency] IS NULL OR [maximum_concurrency] BETWEEN 1 AND 100),
    CONSTRAINT [chk_ai_connection_model_revisions_status] CHECK ([status] IN (N'verified', N'new_revision_required', N'ended')),
    CONSTRAINT [chk_ai_connection_model_revisions_declared_capabilities_json] CHECK (ISJSON([declared_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_revisions_discovered_capabilities_json] CHECK ([discovered_capabilities_json] IS NULL OR ISJSON([discovered_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_revisions_verified_capabilities_json] CHECK ([verified_capabilities_json] IS NULL OR ISJSON([verified_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_revisions_verified_fields] CHECK ([status] <> N'verified' OR ([verified_capabilities_json] IS NOT NULL AND [verified_at] IS NOT NULL)),
    CONSTRAINT [chk_ai_connection_model_revisions_ended_at] CHECK (([status] = N'ended' AND [ended_at] IS NOT NULL) OR ([status] <> N'ended' AND [ended_at] IS NULL))
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

  `CREATE TABLE [ai_connection_model_verification_evidence] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_verification_evidence_id] DEFAULT NEWID(),
    [ai_connection_model_revision_id] uniqueidentifier NOT NULL,
    [ai_connection_verification_evidence_id] uniqueidentifier NOT NULL,
    [outcome] nvarchar(24) NOT NULL,
    [test_suite_version] nvarchar(100) NOT NULL,
    [verified_capabilities_json] nvarchar(max) NOT NULL,
    [profile_compatibility_json] nvarchar(max) NOT NULL,
    [evidence_fingerprint] char(64) NOT NULL,
    [failure_category] nvarchar(80) NULL,
    [details_json] nvarchar(max) NOT NULL,
    [verified_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_ai_connection_model_verification_evidence] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_outcome] CHECK ([outcome] IN (N'passed', N'failed')),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_capabilities_json] CHECK (ISJSON([verified_capabilities_json]) = 1),
    CONSTRAINT [chk_ai_connection_model_verification_evidence_profile_compatibility_json] CHECK (ISJSON([profile_compatibility_json]) = 1),
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
    [ai_connection_model_revision_id] uniqueidentifier NULL,
    [configuration_version] int NOT NULL CONSTRAINT [df_ai_run_profiles_configuration_version] DEFAULT (1),
    [total_time_budget_seconds] int NOT NULL CONSTRAINT [df_ai_run_profiles_total_time_budget_seconds] DEFAULT (1200),
    [inactivity_time_budget_seconds] int NOT NULL CONSTRAINT [df_ai_run_profiles_inactivity_time_budget_seconds] DEFAULT (300),
    [queue_capacity] int NOT NULL CONSTRAINT [df_ai_run_profiles_queue_capacity] DEFAULT (10),
    [maximum_output_tokens] int NOT NULL CONSTRAINT [df_ai_run_profiles_maximum_output_tokens] DEFAULT (8192),
    [maximum_output_bytes] int NOT NULL CONSTRAINT [df_ai_run_profiles_maximum_output_bytes] DEFAULT (4194304),
    [maximum_retained_memory_bytes] int NOT NULL CONSTRAINT [df_ai_run_profiles_maximum_retained_memory_bytes] DEFAULT (8388608),
    [maximum_buffered_events] int NOT NULL CONSTRAINT [df_ai_run_profiles_maximum_buffered_events] DEFAULT (32),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    [revision_token] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_profiles_revision_token] DEFAULT NEWID(),
    CONSTRAINT [pk_ai_run_profiles] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_run_profiles_profile_key] CHECK ([profile_key] IN (N'generation_without_images', N'generation_with_images', N'invalid_json_repair')),
    CONSTRAINT [chk_ai_run_profiles_operational_status] CHECK ([operational_status] IN (N'enabled', N'suspended')),
    CONSTRAINT [chk_ai_run_profiles_unconfigured_enabled] CHECK ([ai_connection_model_revision_id] IS NOT NULL OR [operational_status] = N'enabled'),
    CONSTRAINT [chk_ai_run_profiles_configuration_version] CHECK ([configuration_version] >= 1),
    CONSTRAINT [chk_ai_run_profiles_total_time_budget_seconds] CHECK ([total_time_budget_seconds] BETWEEN 300 AND 3600),
    CONSTRAINT [chk_ai_run_profiles_inactivity_time_budget_seconds] CHECK ([inactivity_time_budget_seconds] BETWEEN 300 AND [total_time_budget_seconds]),
    CONSTRAINT [chk_ai_run_profiles_queue_capacity] CHECK ([queue_capacity] BETWEEN 0 AND 100),
    CONSTRAINT [chk_ai_run_profiles_maximum_output_tokens] CHECK ([maximum_output_tokens] BETWEEN 1 AND 1000000),
    CONSTRAINT [chk_ai_run_profiles_maximum_output_bytes] CHECK ([maximum_output_bytes] BETWEEN 1 AND 67108864),
    CONSTRAINT [chk_ai_run_profiles_maximum_retained_memory_bytes] CHECK ([maximum_retained_memory_bytes] BETWEEN 1 AND 134217728),
    CONSTRAINT [chk_ai_run_profiles_maximum_buffered_events] CHECK ([maximum_buffered_events] BETWEEN 1 AND 1024)
  );`,
  `ALTER TABLE [ai_run_profiles] ADD CONSTRAINT [fk_ai_run_profiles_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_run_profiles_profile_key]
    ON [ai_run_profiles] ([profile_key]);`,
  `CREATE INDEX [idx_ai_run_profiles_ai_connection_model_revision_id]
    ON [ai_run_profiles] ([ai_connection_model_revision_id]);`,

  `CREATE TABLE [ai_connection_model_operational_states] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_id] DEFAULT NEWID(),
    [ai_connection_model_revision_id] uniqueidentifier NOT NULL,
    [health_status] nvarchar(24) NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_health_status] DEFAULT (N'unknown'),
    [circuit_breaker_status] nvarchar(24) NOT NULL CONSTRAINT [df_ai_connection_model_operational_states_breaker_status] DEFAULT (N'closed'),
    [circuit_open_reason] nvarchar(80) NULL,
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
    CONSTRAINT [chk_ai_connection_model_operational_states_circuit_reason] CHECK (([circuit_breaker_status] = N'closed' AND [circuit_open_reason] IS NULL) OR ([circuit_breaker_status] <> N'closed' AND [circuit_open_reason] IS NOT NULL)),
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
      IF UPDATE([id]) OR UPDATE([ai_connection_id]) OR UPDATE([revision_number]) OR UPDATE([created_at])
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

  `CREATE TABLE [ai_run_coordination_entries] (
    [id] uniqueidentifier NOT NULL CONSTRAINT [df_ai_run_coordination_entries_id] DEFAULT NEWID(),
    [application_run_id] nvarchar(100) NOT NULL,
    [fencing_token] uniqueidentifier NOT NULL,
    [ai_connection_id] uniqueidentifier NOT NULL,
    [ai_connection_model_revision_id] uniqueidentifier NOT NULL,
    [ai_run_profile_id] uniqueidentifier NOT NULL,
    [queue_sequence] bigint IDENTITY(1,1) NOT NULL,
    [status] nvarchar(24) NOT NULL,
    [attempt_count] tinyint NOT NULL CONSTRAINT [df_ai_run_coordination_entries_attempt_count] DEFAULT (0),
    [ai_run_profile_configuration_version] int NOT NULL,
    [cancellation_requested_at] datetime2(3) NULL,
    [cancellation_reason] nvarchar(40) NULL,
    [not_before] datetime2(3) NOT NULL,
    [total_deadline_at] datetime2(3) NOT NULL,
    [lease_owner_id] uniqueidentifier NULL,
    [lease_expires_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_ai_run_coordination_entries] PRIMARY KEY ([id]),
    CONSTRAINT [uq_ai_run_coordination_entries_application_run_id] UNIQUE ([application_run_id]),
    CONSTRAINT [chk_ai_run_coordination_entries_status] CHECK ([status] IN (N'queued', N'running', N'retry_wait')),
    CONSTRAINT [chk_ai_run_coordination_entries_attempt_count] CHECK ([attempt_count] BETWEEN 0 AND 2),
    CONSTRAINT [chk_ai_run_coordination_entries_lease] CHECK (([status] = N'running' AND [lease_owner_id] IS NOT NULL AND [lease_expires_at] IS NOT NULL) OR ([status] <> N'running' AND [lease_owner_id] IS NULL AND [lease_expires_at] IS NULL)),
    CONSTRAINT [chk_ai_run_coordination_entries_deadline] CHECK ([total_deadline_at] > [created_at]),
    CONSTRAINT [chk_ai_run_coordination_entries_cancellation] CHECK (([cancellation_requested_at] IS NULL AND [cancellation_reason] IS NULL) OR ([cancellation_requested_at] IS NOT NULL AND [cancellation_reason] IN (N'connection_suspended', N'connection_retired', N'profile_suspended'))),
    CONSTRAINT [chk_ai_run_coordination_entries_profile_configuration_version] CHECK ([ai_run_profile_configuration_version] >= 1)
  );`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_connection_model_revision_id] FOREIGN KEY ([ai_connection_model_revision_id]) REFERENCES [ai_connection_model_revisions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [ai_run_coordination_entries] ADD CONSTRAINT [fk_ai_run_coordination_entries_ai_run_profile_id] FOREIGN KEY ([ai_run_profile_id]) REFERENCES [ai_run_profiles] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_ai_run_coordination_entries_queue_sequence]
    ON [ai_run_coordination_entries] ([queue_sequence]);`,
  `CREATE INDEX [idx_ai_run_coordination_entries_fifo]
    ON [ai_run_coordination_entries] ([ai_connection_id], [status], [not_before], [queue_sequence]);`,
  `CREATE INDEX [idx_ai_run_coordination_entries_lease_expires_at]
    ON [ai_run_coordination_entries] ([lease_expires_at])
    WHERE [lease_expires_at] IS NOT NULL;`,
  `CREATE INDEX [idx_ai_run_coordination_entries_cancellation_requested_at]
    ON [ai_run_coordination_entries] ([cancellation_requested_at])
    WHERE [cancellation_requested_at] IS NOT NULL;`,
  `CREATE INDEX [idx_ai_run_coordination_entries_ai_run_profile_id_ai_run_profile_configuration_version]
    ON [ai_run_coordination_entries]
      ([ai_run_profile_id], [ai_run_profile_configuration_version]);`,

  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
    THROW 51062, 'Runtime permission role is missing.', 1;
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connections] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_attestations] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_connection_verification_evidence] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_models] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_model_revisions] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_connection_model_verification_evidence] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ai_run_profiles] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_connection_model_operational_states] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_provider_secret_versions] TO [kravhantering_runtime];
  GRANT UPDATE ([status], [ciphertext], [nonce], [authentication_tag], [cipher_format_version], [root_key_version], [verified_at], [activated_at], [deactivated_at], [provider_revoked_at], [ciphertext_deleted_at], [revision_token]) ON OBJECT::[dbo].[ai_provider_secret_versions] TO [kravhantering_runtime];
  GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_run_coordination_entries] TO [kravhantering_runtime];
  GRANT UPDATE ([status], [attempt_count], [not_before], [lease_owner_id], [lease_expires_at], [cancellation_requested_at], [cancellation_reason], [updated_at]) ON OBJECT::[dbo].[ai_run_coordination_entries] TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_run_coordination_entries', N'U') IS NOT NULL DROP TABLE [ai_run_coordination_entries];`,
  `IF OBJECT_ID(N'ai_provider_secret_versions', N'U') IS NOT NULL DROP TABLE [ai_provider_secret_versions];`,
  `IF OBJECT_ID(N'ai_connection_model_operational_states', N'U') IS NOT NULL DROP TABLE [ai_connection_model_operational_states];`,
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
