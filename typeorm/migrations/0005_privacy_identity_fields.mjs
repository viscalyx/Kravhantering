const UP_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_owners_email' AND object_id = OBJECT_ID(N'owners')) DROP INDEX [uq_owners_email] ON [owners];",
  'ALTER TABLE [owners] ALTER COLUMN [email] nvarchar(450) NULL;',
  'ALTER TABLE [owners] ADD [hsa_id] nvarchar(64) NULL;',
  'CREATE UNIQUE INDEX [uq_owners_email] ON [owners] ([email]) WHERE [email] IS NOT NULL;',
  'CREATE UNIQUE INDEX [uq_owners_hsa_id] ON [owners] ([hsa_id]) WHERE [hsa_id] IS NOT NULL;',
  'ALTER TABLE [requirement_versions] ADD [created_by_hsa_id] nvarchar(64) NULL;',
  'ALTER TABLE [deviations] ADD [created_by_hsa_id] nvarchar(64) NULL, [decided_by_hsa_id] nvarchar(64) NULL;',
  'ALTER TABLE [specification_local_requirement_deviations] ADD [created_by_hsa_id] nvarchar(64) NULL, [decided_by_hsa_id] nvarchar(64) NULL;',
  'ALTER TABLE [improvement_suggestions] ADD [created_by_hsa_id] nvarchar(64) NULL, [resolved_by_hsa_id] nvarchar(64) NULL;',
  'ALTER TABLE [requirements_specifications] ADD [responsible_hsa_id] nvarchar(64) NULL, [responsible_display_name] nvarchar(max) NULL, [can_responsible_generate_ai] bit NOT NULL CONSTRAINT [df_requirements_specifications_can_responsible_generate_ai] DEFAULT (0);',
  'CREATE INDEX [idx_requirement_versions_created_by_hsa_id] ON [requirement_versions] ([created_by_hsa_id]);',
  'CREATE INDEX [idx_deviations_created_by_hsa_id] ON [deviations] ([created_by_hsa_id]);',
  'CREATE INDEX [idx_deviations_decided_by_hsa_id] ON [deviations] ([decided_by_hsa_id]);',
  'CREATE INDEX [idx_specification_local_requirement_deviations_created_by_hsa_id] ON [specification_local_requirement_deviations] ([created_by_hsa_id]);',
  'CREATE INDEX [idx_specification_local_requirement_deviations_decided_by_hsa_id] ON [specification_local_requirement_deviations] ([decided_by_hsa_id]);',
  'CREATE INDEX [idx_improvement_suggestions_created_by_hsa_id] ON [improvement_suggestions] ([created_by_hsa_id]);',
  'CREATE INDEX [idx_improvement_suggestions_resolved_by_hsa_id] ON [improvement_suggestions] ([resolved_by_hsa_id]);',
  'CREATE INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications] ([responsible_hsa_id]);',
  'CREATE TABLE [requirement_area_co_authors] (\n  [area_id] int NOT NULL,\n  [hsa_id] nvarchar(64) NOT NULL,\n  [display_name] nvarchar(max) NOT NULL,\n  [can_generate_ai] bit NOT NULL CONSTRAINT [df_requirement_area_co_authors_can_generate_ai] DEFAULT (0),\n  [created_at] datetime2(3) NOT NULL,\n  [created_by_hsa_id] nvarchar(64) NULL,\n  CONSTRAINT [pk_requirement_area_co_authors] PRIMARY KEY ([area_id], [hsa_id])\n);',
  'CREATE INDEX [idx_requirement_area_co_authors_hsa_id] ON [requirement_area_co_authors] ([hsa_id]);',
  'CREATE INDEX [idx_requirement_area_co_authors_created_by_hsa_id] ON [requirement_area_co_authors] ([created_by_hsa_id]);',
  'ALTER TABLE [requirement_area_co_authors] ADD CONSTRAINT [fk_requirement_area_co_authors_area_id] FOREIGN KEY ([area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
  'CREATE TABLE [specification_co_authors] (\n  [specification_id] int NOT NULL,\n  [hsa_id] nvarchar(64) NOT NULL,\n  [display_name] nvarchar(max) NOT NULL,\n  [can_generate_ai] bit NOT NULL CONSTRAINT [df_specification_co_authors_can_generate_ai] DEFAULT (0),\n  [created_at] datetime2(3) NOT NULL,\n  [created_by_hsa_id] nvarchar(64) NULL,\n  CONSTRAINT [pk_specification_co_authors] PRIMARY KEY ([specification_id], [hsa_id])\n);',
  'CREATE INDEX [idx_specification_co_authors_hsa_id] ON [specification_co_authors] ([hsa_id]);',
  'CREATE INDEX [idx_specification_co_authors_created_by_hsa_id] ON [specification_co_authors] ([created_by_hsa_id]);',
  'ALTER TABLE [specification_co_authors] ADD CONSTRAINT [fk_specification_co_authors_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
]

const DOWN_STATEMENTS = [
  "IF OBJECT_ID(N'specification_co_authors', N'U') IS NOT NULL DROP TABLE [specification_co_authors];",
  "IF OBJECT_ID(N'requirement_area_co_authors', N'U') IS NOT NULL DROP TABLE [requirement_area_co_authors];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirements_specifications_responsible_hsa_id' AND object_id = OBJECT_ID(N'requirements_specifications')) DROP INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications];",
  "IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirements_specifications_can_responsible_generate_ai') ALTER TABLE [requirements_specifications] DROP CONSTRAINT [df_requirements_specifications_can_responsible_generate_ai];",
  'ALTER TABLE [requirements_specifications] DROP COLUMN [responsible_hsa_id], [responsible_display_name], [can_responsible_generate_ai];',
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_improvement_suggestions_resolved_by_hsa_id' AND object_id = OBJECT_ID(N'improvement_suggestions')) DROP INDEX [idx_improvement_suggestions_resolved_by_hsa_id] ON [improvement_suggestions];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_improvement_suggestions_created_by_hsa_id' AND object_id = OBJECT_ID(N'improvement_suggestions')) DROP INDEX [idx_improvement_suggestions_created_by_hsa_id] ON [improvement_suggestions];",
  'ALTER TABLE [improvement_suggestions] DROP COLUMN [created_by_hsa_id], [resolved_by_hsa_id];',
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_specification_local_requirement_deviations_decided_by_hsa_id' AND object_id = OBJECT_ID(N'specification_local_requirement_deviations')) DROP INDEX [idx_specification_local_requirement_deviations_decided_by_hsa_id] ON [specification_local_requirement_deviations];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_specification_local_requirement_deviations_created_by_hsa_id' AND object_id = OBJECT_ID(N'specification_local_requirement_deviations')) DROP INDEX [idx_specification_local_requirement_deviations_created_by_hsa_id] ON [specification_local_requirement_deviations];",
  'ALTER TABLE [specification_local_requirement_deviations] DROP COLUMN [created_by_hsa_id], [decided_by_hsa_id];',
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_deviations_decided_by_hsa_id' AND object_id = OBJECT_ID(N'deviations')) DROP INDEX [idx_deviations_decided_by_hsa_id] ON [deviations];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_deviations_created_by_hsa_id' AND object_id = OBJECT_ID(N'deviations')) DROP INDEX [idx_deviations_created_by_hsa_id] ON [deviations];",
  'ALTER TABLE [deviations] DROP COLUMN [created_by_hsa_id], [decided_by_hsa_id];',
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirement_versions_created_by_hsa_id' AND object_id = OBJECT_ID(N'requirement_versions')) DROP INDEX [idx_requirement_versions_created_by_hsa_id] ON [requirement_versions];",
  'ALTER TABLE [requirement_versions] DROP COLUMN [created_by_hsa_id];',
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_owners_hsa_id' AND object_id = OBJECT_ID(N'owners')) DROP INDEX [uq_owners_hsa_id] ON [owners];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_owners_email' AND object_id = OBJECT_ID(N'owners')) DROP INDEX [uq_owners_email] ON [owners];",
  'ALTER TABLE [owners] DROP COLUMN [hsa_id];',
  "IF EXISTS (SELECT 1 FROM [owners] WHERE [email] IS NULL) THROW 51000, N'Cannot roll back privacy identity fields while owners.email contains NULL values; backfill or remove those rows before restoring NOT NULL.', 1;",
  'ALTER TABLE [owners] ALTER COLUMN [email] nvarchar(450) NOT NULL;',
  'CREATE UNIQUE INDEX [uq_owners_email] ON [owners] ([email]);',
]

export class PrivacyIdentityFields1715100000000 {
  name = 'PrivacyIdentityFields1715100000000'

  async up(queryRunner) {
    for (const sql of UP_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }

  async down(queryRunner) {
    for (const sql of DOWN_STATEMENTS) {
      try {
        await queryRunner.query(sql)
      } catch (err) {
        err.message = `${err.message}\n--- failing statement:\n${sql}`
        throw err
      }
    }
  }
}

export default PrivacyIdentityFields1715100000000
