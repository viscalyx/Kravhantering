-- Run as the DBA in the migrated application or restored rollback database.
-- First map a dedicated cleanup login to the kravhantering_cleanup user.
SET XACT_ABORT ON;

IF DB_ID() <= 4
  THROW 51000, 'Select the application database before granting cleanup permissions.', 1;

IF NOT EXISTS (
  SELECT 1 FROM sys.database_principals
  WHERE name = N'kravhantering_cleanup' AND type IN (N'S', N'U', N'E')
) OR EXISTS (
  SELECT 1 FROM sys.database_role_members
  WHERE member_principal_id = DATABASE_PRINCIPAL_ID(N'kravhantering_cleanup')
)
  THROW 51000, 'Create a dedicated cleanup user without database role memberships.', 1;

BEGIN TRANSACTION;

GRANT VIEW DEFINITION TO [kravhantering_cleanup];

-- A rollback schema can predate individual cleanup targets.
IF OBJECT_ID(N'dbo.ai_model_verification_attempts', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.ai_model_verification_attempts TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.ai_run_coordination_entries', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.ai_run_coordination_entries TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.export_actor_quota_entries', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.export_actor_quota_entries TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.hsa_verification_quota_buckets', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.hsa_verification_quota_buckets TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.requirement_import_validation_rate_buckets', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.requirement_import_validation_rate_buckets TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.requirement_import_validation_sessions', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.requirement_import_validation_sessions TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.ai_forensic_evidence_events', N'U') IS NOT NULL
  GRANT SELECT, DELETE ON OBJECT::dbo.ai_forensic_evidence_events TO [kravhantering_cleanup];
IF OBJECT_ID(N'dbo.ai_forensic_capture_windows', N'U') IS NOT NULL
  GRANT SELECT, UPDATE ON OBJECT::dbo.ai_forensic_capture_windows TO [kravhantering_cleanup];

COMMIT;
