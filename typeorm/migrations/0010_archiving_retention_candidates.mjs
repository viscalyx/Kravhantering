const UP_STATEMENTS = [
  'ALTER TABLE [requirement_versions] ADD [status_updated_at] datetime2(3) NULL;',
  'ALTER TABLE [requirement_versions] ADD [has_specification_item_history] bit NOT NULL CONSTRAINT [df_requirement_versions_has_specification_item_history] DEFAULT (0);',
  `UPDATE [requirement_versions]
    SET [status_updated_at] = COALESCE([archived_at], [published_at], [edited_at], [created_at])
    WHERE [status_updated_at] IS NULL;`,
  `UPDATE [requirement_versions]
    SET [has_specification_item_history] = 1
    WHERE EXISTS (
      SELECT 1
      FROM [requirements_specification_items] item
      WHERE item.[requirement_version_id] = [requirement_versions].[id]
    );`,
  'CREATE INDEX [idx_requirement_versions_status_updated_at] ON [requirement_versions] ([status_updated_at]);',
  'CREATE INDEX [idx_requirement_versions_has_specification_item_history] ON [requirement_versions] ([has_specification_item_history]);',
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirement_versions_has_specification_item_history' AND object_id = OBJECT_ID(N'requirement_versions')) DROP INDEX [idx_requirement_versions_has_specification_item_history] ON [requirement_versions];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirement_versions_status_updated_at' AND object_id = OBJECT_ID(N'requirement_versions')) DROP INDEX [idx_requirement_versions_status_updated_at] ON [requirement_versions];",
  "IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirement_versions_has_specification_item_history') ALTER TABLE [requirement_versions] DROP CONSTRAINT [df_requirement_versions_has_specification_item_history];",
  "IF COL_LENGTH(N'requirement_versions', N'has_specification_item_history') IS NOT NULL ALTER TABLE [requirement_versions] DROP COLUMN [has_specification_item_history];",
  "IF COL_LENGTH(N'requirement_versions', N'status_updated_at') IS NOT NULL ALTER TABLE [requirement_versions] DROP COLUMN [status_updated_at];",
]

export class ArchivingRetentionCandidates1715400000000 {
  name = 'ArchivingRetentionCandidates1715400000000'

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

export default ArchivingRetentionCandidates1715400000000
