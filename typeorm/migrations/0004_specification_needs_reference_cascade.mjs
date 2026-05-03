const UP_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_needs_references_specification_id') ALTER TABLE [specification_needs_references] DROP CONSTRAINT [fk_specification_needs_references_specification_id];",
  'ALTER TABLE [specification_needs_references] ADD CONSTRAINT [fk_specification_needs_references_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
]

const DOWN_STATEMENTS = [
  "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_specification_needs_references_specification_id') ALTER TABLE [specification_needs_references] DROP CONSTRAINT [fk_specification_needs_references_specification_id];",
  'ALTER TABLE [specification_needs_references] ADD CONSTRAINT [fk_specification_needs_references_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;',
]

export class SpecificationNeedsReferenceCascade1715000000000 {
  name = 'SpecificationNeedsReferenceCascade1715000000000'

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

export default SpecificationNeedsReferenceCascade1715000000000
