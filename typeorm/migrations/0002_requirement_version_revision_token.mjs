const UP_STATEMENTS = [
  "IF COL_LENGTH(N'dbo.requirement_versions', N'revision_token') IS NULL\nBEGIN\n  ALTER TABLE [requirement_versions] ADD [revision_token] uniqueidentifier NULL;\n  UPDATE [requirement_versions] SET [revision_token] = NEWID() WHERE [revision_token] IS NULL;\n  ALTER TABLE [requirement_versions] ALTER COLUMN [revision_token] uniqueidentifier NOT NULL;\n  ALTER TABLE [requirement_versions] ADD CONSTRAINT [df_requirement_versions_revision_token] DEFAULT NEWID() FOR [revision_token];\n  CREATE UNIQUE INDEX [uq_requirement_versions_revision_token] ON [requirement_versions] ([revision_token]);\nEND",
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_requirement_versions_revision_token' AND object_id = OBJECT_ID(N'dbo.requirement_versions')) DROP INDEX [uq_requirement_versions_revision_token] ON [requirement_versions];",
  "IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirement_versions_revision_token' AND parent_object_id = OBJECT_ID(N'dbo.requirement_versions')) ALTER TABLE [requirement_versions] DROP CONSTRAINT [df_requirement_versions_revision_token];",
  "IF COL_LENGTH(N'dbo.requirement_versions', N'revision_token') IS NOT NULL ALTER TABLE [requirement_versions] DROP COLUMN [revision_token];",
]

export class RequirementVersionRevisionToken1713800000000 {
  name = 'RequirementVersionRevisionToken1713800000000'
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
export default RequirementVersionRevisionToken1713800000000
