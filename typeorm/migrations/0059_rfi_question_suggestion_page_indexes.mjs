const UP_STATEMENTS = [
  `DROP INDEX [idx_rfi_question_suggestions_area_id]
    ON [rfi_question_suggestions];`,
  `DROP INDEX [idx_rfi_question_suggestions_specification_id]
    ON [rfi_question_suggestions];`,
  `CREATE INDEX [idx_rfi_question_suggestions_created_at_id]
    ON [rfi_question_suggestions] ([created_at], [id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_area_id_created_at_id]
    ON [rfi_question_suggestions] ([area_id], [created_at], [id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_specification_id_created_at_id]
    ON [rfi_question_suggestions] ([specification_id], [created_at], [id]);`,
]

const DOWN_STATEMENTS = [
  `DROP INDEX [idx_rfi_question_suggestions_specification_id_created_at_id]
    ON [rfi_question_suggestions];`,
  `DROP INDEX [idx_rfi_question_suggestions_area_id_created_at_id]
    ON [rfi_question_suggestions];`,
  `DROP INDEX [idx_rfi_question_suggestions_created_at_id]
    ON [rfi_question_suggestions];`,
  `CREATE INDEX [idx_rfi_question_suggestions_specification_id]
    ON [rfi_question_suggestions] ([specification_id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_area_id]
    ON [rfi_question_suggestions] ([area_id]);`,
]

export class RfiQuestionSuggestionPageIndexes1720600000000 {
  name = 'RfiQuestionSuggestionPageIndexes1720600000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default RfiQuestionSuggestionPageIndexes1720600000000
