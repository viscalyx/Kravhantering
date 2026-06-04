const UP_STATEMENTS = [
  'DROP INDEX [idx_specification_requirement_selection_answers_filter] ON [specification_requirement_selection_answers];',
  'ALTER TABLE [specification_requirement_selection_answers] DROP CONSTRAINT [df_specification_requirement_selection_answers_is_filter_active];',
  "EXEC sp_rename 'specification_requirement_selection_answers.is_filter_active', 'is_historical', 'COLUMN';",
  `UPDATE [specification_requirement_selection_answers]
    SET [is_historical] = CASE WHEN [is_historical] = 1 THEN 0 ELSE 1 END;`,
  'ALTER TABLE [specification_requirement_selection_answers] ADD CONSTRAINT [df_specification_requirement_selection_answers_is_historical] DEFAULT (0) FOR [is_historical];',
  'CREATE INDEX [idx_specification_requirement_selection_answers_historical] ON [specification_requirement_selection_answers] ([specification_id], [is_historical]);',
]

const DOWN_STATEMENTS = [
  'DROP INDEX [idx_specification_requirement_selection_answers_historical] ON [specification_requirement_selection_answers];',
  'ALTER TABLE [specification_requirement_selection_answers] DROP CONSTRAINT [df_specification_requirement_selection_answers_is_historical];',
  "EXEC sp_rename 'specification_requirement_selection_answers.is_historical', 'is_filter_active', 'COLUMN';",
  `UPDATE [specification_requirement_selection_answers]
    SET [is_filter_active] = CASE WHEN [is_filter_active] = 1 THEN 0 ELSE 1 END;`,
  'ALTER TABLE [specification_requirement_selection_answers] ADD CONSTRAINT [df_specification_requirement_selection_answers_is_filter_active] DEFAULT (1) FOR [is_filter_active];',
  'CREATE INDEX [idx_specification_requirement_selection_answers_filter] ON [specification_requirement_selection_answers] ([specification_id], [is_filter_active]);',
]

export class RequirementSelectionSavedAnswerHistoryFlag1716686400000 {
  name = 'RequirementSelectionSavedAnswerHistoryFlag1716686400000'

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

export default RequirementSelectionSavedAnswerHistoryFlag1716686400000
