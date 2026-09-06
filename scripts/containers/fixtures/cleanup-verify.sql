-- Synthetic release-verification data; run only in an isolated compatibility database.
IF DB_NAME() NOT LIKE N'cleanup[_]compat[_]%' THROW 51000, 'isolated cleanup database required', 1;
IF OBJECT_ID(N'dbo.ai_run_coordination_entries', N'U') IS NOT NULL
EXEC(N'IF EXISTS (SELECT 1 FROM ai_run_coordination_entries) THROW 51000, ''coordination fixture retained'', 1;');
IF OBJECT_ID(N'dbo.requirement_import_validation_sessions', N'U') IS NOT NULL
EXEC(N'IF (SELECT COUNT(*) FROM requirement_import_validation_sessions) <> 1 OR EXISTS (SELECT 1 FROM requirement_import_validation_sessions WHERE expires_at <= SYSUTCDATETIME()) THROW 51000, ''session fixture mismatch'', 1;');
IF OBJECT_ID(N'dbo.requirement_import_validation_rate_buckets', N'U') IS NOT NULL
EXEC(N'IF (SELECT COUNT(*) FROM requirement_import_validation_rate_buckets) <> 1 OR EXISTS (SELECT 1 FROM requirement_import_validation_rate_buckets WHERE expires_at <= SYSUTCDATETIME()) THROW 51000, ''rate fixture mismatch'', 1;');
IF OBJECT_ID(N'dbo.hsa_verification_quota_buckets', N'U') IS NOT NULL
EXEC(N'IF (SELECT COUNT(*) FROM hsa_verification_quota_buckets) <> 1 OR EXISTS (SELECT 1 FROM hsa_verification_quota_buckets WHERE expires_at <= SYSUTCDATETIME()) THROW 51000, ''quota fixture mismatch'', 1;');
IF OBJECT_ID(N'dbo.ai_forensic_capture_windows', N'U') IS NOT NULL
EXEC(N'IF EXISTS (SELECT 1 FROM ai_forensic_evidence_events) OR NOT EXISTS (SELECT 1 FROM ai_forensic_capture_windows WHERE purged_at IS NOT NULL AND expiry_audited_at IS NOT NULL AND is_open IS NULL) THROW 51000, ''forensic fixture mismatch'', 1;');

IF OBJECT_ID(N'dbo.ai_model_verification_attempts', N'U') IS NOT NULL
EXEC(N'IF EXISTS (SELECT 1 FROM ai_model_verification_attempts) THROW 51000, ''verification fixture retained'', 1;');
