const UP_STATEMENTS = [
  `ALTER TABLE [improvement_suggestions] ADD
    [implementing_requirement_version_id] int NULL,
    [implementation_recorded_at] datetime2(3) NULL;`,
  `ALTER TABLE [improvement_suggestions] ADD CONSTRAINT [fk_improvement_suggestions_implementing_requirement_version_id] FOREIGN KEY ([implementing_requirement_version_id]) REFERENCES [requirement_versions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_improvement_suggestions_implementing_requirement_version_id]
    ON [improvement_suggestions] ([implementing_requirement_version_id]);`,
  `ALTER TABLE [improvement_suggestions] ADD CONSTRAINT
    [chk_improvement_suggestions_implementation]
    CHECK (
      ([implementing_requirement_version_id] IS NULL AND [implementation_recorded_at] IS NULL)
      OR ([resolution] IS NOT NULL AND [resolution] = 1
        AND [implementation_recorded_at] IS NOT NULL
        AND [implementation_recorded_at] >= [resolved_at])
    );`,
]

const DOWN_STATEMENTS = [
  `ALTER TABLE [improvement_suggestions] DROP CONSTRAINT
    [chk_improvement_suggestions_implementation],
    [fk_improvement_suggestions_implementing_requirement_version_id];`,
  `DROP INDEX [idx_improvement_suggestions_implementing_requirement_version_id]
    ON [improvement_suggestions];`,
  `ALTER TABLE [improvement_suggestions] DROP COLUMN
    [implementing_requirement_version_id], [implementation_recorded_at];`,
]

export class SuggestionImplementation1788998400000 {
  name = 'SuggestionImplementation1788998400000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}
