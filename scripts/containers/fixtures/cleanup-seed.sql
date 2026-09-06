-- Synthetic release-verification data; run only in an isolated compatibility database.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
IF DB_NAME() NOT LIKE N'cleanup[_]compat[_]%' THROW 51000, 'isolated cleanup database required', 1;
BEGIN TRANSACTION;
-- Match the documented host-cleanup metadata prerequisite without elevating the runtime identity.
GRANT VIEW DEFINITION TO [kravhantering_runtime];
IF OBJECT_ID(N'dbo.ai_run_coordination_entries', N'U') IS NOT NULL
EXEC(N'DECLARE @connection uniqueidentifier=NEWID(), @model uniqueidentifier=NEWID(), @revision uniqueidentifier=NEWID(), @profile uniqueidentifier=NEWID();
INSERT INTO [ai_connections] (
         [id], [administration_name], [public_name], [adapter_key],
         [adapter_version], [endpoint_url], [authentication_type],
         [tls_policy_key], [egress_policy_key], [data_policy_summary],
         [lifecycle_status], [configuration_version], [maximum_concurrency],
         [created_at], [updated_at]
       ) VALUES (
         @connection, N''Runtime AI evidence'', N''Runtime AI evidence'', N''controlled_test'',
         N''1'', N''https://ai.example.test/v1'', N''none'', N''public_web_pki'',
         N''runtime_test'', N''No production data'', N''active'', 1, 1,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       );
       INSERT INTO [ai_connection_models] (
         [id], [ai_connection_id], [name], [created_at], [updated_at]
       ) VALUES (@model, @connection, N''Runtime model'', SYSUTCDATETIME(), SYSUTCDATETIME());
       INSERT INTO [ai_connection_model_revisions] (
         [id], [ai_connection_model_id], [revision_number],
         [connection_configuration_version], [status], [external_model_id],
         [declared_capabilities_json], [created_at], [updated_at]
       ) VALUES (@revision, @model, 1, 1, N''new_revision_required'', N''runtime/model'', N''{}'',
         SYSUTCDATETIME(), SYSUTCDATETIME());
       INSERT INTO [ai_run_profiles] (
         [id], [profile_key], [ai_connection_model_revision_id],
         [operational_status], [created_at], [updated_at]
       ) VALUES (@profile, N''generation_without_images'', @revision, N''enabled'',
         SYSUTCDATETIME(), SYSUTCDATETIME());
INSERT INTO [ai_run_coordination_entries] (
           [application_run_id], [fencing_token], [ai_connection_id],
           [ai_connection_model_revision_id], [ai_run_profile_id],
           [ai_run_profile_configuration_version],
           [status], [attempt_count], [lease_owner_id], [lease_expires_at],
           [not_before], [total_deadline_at], [created_at], [updated_at]
         ) VALUES (NEWID(), NEWID(), @connection, @revision, @profile, 1, N''queued'', 0, NULL,
           NULL, SYSUTCDATETIME(),
           DATEADD(hour, -1, SYSUTCDATETIME()), DATEADD(hour, -2, SYSUTCDATETIME()),
           SYSUTCDATETIME())');
IF OBJECT_ID(N'dbo.ai_model_verification_attempts', N'U') IS NOT NULL
EXEC(N'DECLARE @now datetime2 = SYSUTCDATETIME();
  INSERT INTO ai_model_verification_attempts
    (id, ai_connection_id, fingerprint, payload_json, created_at, expires_at)
  SELECT NEWID(), id, REPLICATE(N''a'', 64), N''{}'',
    DATEADD(minute, -16, @now), DATEADD(minute, -1, @now)
  FROM ai_connections;');
IF OBJECT_ID(N'dbo.requirement_import_validation_sessions', N'U') IS NOT NULL
EXEC(N'
    DECLARE @now datetime2(3) = SYSUTCDATETIME();
    INSERT INTO requirement_import_validation_sessions (
      token_hash,
      creator_principal_fingerprint,
      payload_hash,
      destination_kind,
      destination_id,
      reference_data_fingerprint,
      reserved_bytes,
      destination_snapshot_json,
      submitted_payload_json,
      validation_result_json,
      execution_result_json,
      expires_at,
      created_at,
      updated_at
    ) VALUES
      (REPLICATE(N''a'', 64), REPLICATE(N''p'', 64), REPLICATE(N''b'', 64), N''requirements_library'',
       1, REPLICATE(N''c'', 64), 4096, N''{}'', N''{"expired":1}'', N''{}'', NULL,
       DATEADD(hour, -1, @now), DATEADD(hour, -2, @now), @now),
      (REPLICATE(N''d'', 64), REPLICATE(N''p'', 64), REPLICATE(N''e'', 64), N''requirements_library'',
       1, REPLICATE(N''f'', 64), 4096, N''{}'', N''{"expired":2}'', N''{}'', NULL,
       DATEADD(minute, -30, @now), DATEADD(hour, -1, @now), @now),
      (REPLICATE(N''g'', 64), REPLICATE(N''p'', 64), REPLICATE(N''h'', 64), N''requirements_library'',
       1, REPLICATE(N''i'', 64), 4096, N''{}'', N''{"expired":3}'', N''{}'', NULL,
       DATEADD(minute, -1, @now), DATEADD(hour, -1, @now), @now),
      (REPLICATE(N''j'', 64), REPLICATE(N''p'', 64), REPLICATE(N''k'', 64), N''requirements_library'',
       1, REPLICATE(N''l'', 64), 4096, N''{}'', N''{"active":true}'', N''{}'', NULL,
       DATEADD(hour, 1, @now), @now, @now);
  ');
IF OBJECT_ID(N'dbo.requirement_import_validation_rate_buckets', N'U') IS NOT NULL
EXEC(N'
      DECLARE @now datetime2(3) = SYSUTCDATETIME();
      INSERT INTO requirement_import_validation_rate_buckets (
        principal_fingerprint, window_started_at, successful_creations,
        expires_at, created_at, updated_at
      ) VALUES
        (REPLICATE(N''a'', 64), DATEADD(minute, -20, @now), 3,
         DATEADD(minute, -10, @now), DATEADD(minute, -20, @now), @now),
        (REPLICATE(N''b'', 64), DATEADD(minute, -10, @now), 2,
         DATEADD(minute, 10, @now), DATEADD(minute, -10, @now), @now);
    ');
IF OBJECT_ID(N'dbo.hsa_verification_quota_buckets', N'U') IS NOT NULL
EXEC(N'
      DECLARE @current_window datetime2(3) = DATEADD(
        minute, DATEDIFF_BIG(minute, CONVERT(datetime2(3), ''1970-01-01''), SYSUTCDATETIME()),
        CONVERT(datetime2(3), ''1970-01-01'')
      );
      INSERT INTO hsa_verification_quota_buckets (
        bucket_kind, actor_fingerprint, target_fingerprint,
        actor_subject_fingerprint, request_count, window_started_at,
        expires_at, created_at, updated_at
      ) VALUES
        (N''actor'', N''afp_aaaaaaaaaaaaaaaaaaaaaa'', NULL,
         N''hfp_bbbbbbbbbbbbbbbbbbbbbb'', 3,
         DATEADD(minute, -1, @current_window), @current_window,
         DATEADD(minute, -1, @current_window), @current_window),
        (N''target'', NULL, N''hfp_cccccccccccccccccccccc'', NULL, 2,
         DATEADD(day, 1, @current_window), DATEADD(second, 60, DATEADD(day, 1, @current_window)),
         DATEADD(day, 1, @current_window), DATEADD(day, 1, @current_window));
    ');
IF OBJECT_ID(N'dbo.ai_forensic_capture_windows', N'U') IS NOT NULL
EXEC(N'
      DECLARE @now datetime2(3) = SYSUTCDATETIME();
      INSERT INTO ai_forensic_capture_windows (
        operation, direction, requested_by_hsa_id,
        requested_by_display_name, requested_at, approved_by_hsa_id,
        approved_by_display_name, approved_at, expires_at,
        stopped_at, is_open, event_byte_limit, event_item_limit,
        collection_item_limit
      ) VALUES (
        N''ai.generate-requirement-import'', N''output'',
        N''SE5560000001-cleanup-admin1'', N''Ada Admin'', DATEADD(hour, -74, @now),
        N''SE5560000001-cleanup-privacy1'', N''Disa Privacy Officer'',
        DATEADD(hour, -74, @now), DATEADD(minute, -4400, @now),
        NULL, 1, 8192, 8, 1000
      );
      DECLARE @captureId int = SCOPE_IDENTITY();
      DECLARE @evidence nvarchar(max) = N''[{"label":"output","excerpt":"[REDACTED_SECRET]"}]'';
      INSERT INTO ai_forensic_evidence_events (
        ai_forensic_capture_window_id, event_id, actor_fingerprint,
        blocked_step, primary_rule_id, rule_ids_json, evidence_json,
        item_count, byte_count, captured_at
      ) VALUES (
        @captureId, NEWID(), NULL, N''final_model_output'', N''sensitive_backend_leak'',
        N''["sensitive_backend_leak"]'', @evidence, 1, DATALENGTH(@evidence),
        DATEADD(hour, -73, @now)
      );
    ');
COMMIT;
