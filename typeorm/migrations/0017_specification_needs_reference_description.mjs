const UP_STATEMENTS = [
  'ALTER TABLE [specification_needs_references] ADD [description] nvarchar(max) NULL;',
  'ALTER TABLE [specification_needs_references] ADD [updated_at] datetime2(3) NULL;',
  'UPDATE [specification_needs_references] SET [updated_at] = [created_at] WHERE [updated_at] IS NULL;',
  'ALTER TABLE [specification_needs_references] ALTER COLUMN [updated_at] datetime2(3) NOT NULL;',
]

const DOWN_STATEMENTS = [
  'ALTER TABLE [specification_needs_references] DROP COLUMN [updated_at];',
  'ALTER TABLE [specification_needs_references] DROP COLUMN [description];',
]

export class SpecificationNeedsReferenceDescription1716000000000 {
  name = 'SpecificationNeedsReferenceDescription1716000000000'

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

export default SpecificationNeedsReferenceDescription1716000000000
