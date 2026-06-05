const UP_STATEMENTS = [
  'ALTER TABLE [requirement_selection_questions] ADD [archived_at] datetime2(3) NULL;',
  'ALTER TABLE [requirement_selection_answers] ADD [archived_at] datetime2(3) NULL;',
  `UPDATE [requirement_selection_questions]
    SET [archived_at] = [updated_at]
    WHERE [is_archived] = 1
      AND [archived_at] IS NULL;`,
  `UPDATE [requirement_selection_answers]
    SET [archived_at] = [updated_at]
    WHERE [is_archived] = 1
      AND [archived_at] IS NULL;`,
  'CREATE INDEX [idx_requirement_selection_questions_archived_at] ON [requirement_selection_questions] ([is_archived], [archived_at]);',
  'CREATE INDEX [idx_requirement_selection_answers_archived_at] ON [requirement_selection_answers] ([is_archived], [archived_at]);',
]

const DOWN_STATEMENTS = [
  'DROP INDEX [idx_requirement_selection_answers_archived_at] ON [requirement_selection_answers];',
  'DROP INDEX [idx_requirement_selection_questions_archived_at] ON [requirement_selection_questions];',
  'ALTER TABLE [requirement_selection_answers] DROP COLUMN [archived_at];',
  'ALTER TABLE [requirement_selection_questions] DROP COLUMN [archived_at];',
]

export class RequirementSelectionRetention1716600000000 {
  name = 'RequirementSelectionRetention1716600000000'

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

export default RequirementSelectionRetention1716600000000
