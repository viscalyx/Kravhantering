const UP_STATEMENTS = [
  `IF EXISTS (
  SELECT 1
  FROM [requirement_versions]
  WHERE [archive_initiated_at] IS NOT NULL
  GROUP BY [requirement_id]
  HAVING COUNT_BIG(*) > 1
)
  THROW 51000, N'Cannot create uq_requirement_versions_archive_initiated_requirement_id: duplicate archiving-in-progress requirement_versions rows exist.', 1;`,
  `IF EXISTS (
  SELECT 1
  FROM [requirement_versions]
  WHERE [requirement_status_id] = 3
  GROUP BY [requirement_id]
  HAVING COUNT_BIG(*) > 1
)
  THROW 51000, N'Cannot create uq_requirement_versions_published_requirement_id: duplicate Published requirement_versions rows exist.', 1;`,
  'CREATE UNIQUE INDEX [uq_requirement_versions_archive_initiated_requirement_id] ON [requirement_versions] ([requirement_id]) WHERE [archive_initiated_at] IS NOT NULL;',
  'CREATE UNIQUE INDEX [uq_requirement_versions_published_requirement_id] ON [requirement_versions] ([requirement_id]) WHERE [requirement_status_id] = 3;',
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_requirement_versions_published_requirement_id' AND object_id = OBJECT_ID(N'requirement_versions')) DROP INDEX [uq_requirement_versions_published_requirement_id] ON [requirement_versions];",
  "IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_requirement_versions_archive_initiated_requirement_id' AND object_id = OBJECT_ID(N'requirement_versions')) DROP INDEX [uq_requirement_versions_archive_initiated_requirement_id] ON [requirement_versions];",
]

export class RequirementVersionLifecycleUniqueIndexes1716000000000 {
  name = 'RequirementVersionLifecycleUniqueIndexes1716000000000'

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

export default RequirementVersionLifecycleUniqueIndexes1716000000000
