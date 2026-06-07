const UP_STATEMENTS = [
  `CREATE TABLE [requirement_selection_question_visibility_groups] (
    [id] int IDENTITY(1,1) NOT NULL,
    [question_id] int NOT NULL,
    [sort_order] int NOT NULL CONSTRAINT [df_requirement_selection_question_visibility_groups_sort_order] DEFAULT (0),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_requirement_selection_question_visibility_groups] PRIMARY KEY ([id])
  );`,
  `ALTER TABLE [requirement_selection_question_visibility_groups] ADD CONSTRAINT [fk_requirement_selection_question_visibility_groups_question_id] FOREIGN KEY ([question_id]) REFERENCES [requirement_selection_questions] ([id])
    ON DELETE CASCADE
    ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_selection_question_visibility_groups_question_id]
    ON [requirement_selection_question_visibility_groups] ([question_id], [sort_order]);`,

  `CREATE TABLE [requirement_selection_question_visibility_conditions] (
    [id] int IDENTITY(1,1) NOT NULL,
    [visibility_group_id] int NOT NULL,
    [parent_question_id] int NOT NULL,
    [answer_id] int NOT NULL,
    [sort_order] int NOT NULL CONSTRAINT [df_requirement_selection_question_visibility_conditions_sort_order] DEFAULT (0),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_requirement_selection_question_visibility_conditions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_requirement_selection_question_visibility_conditions_answer]
      UNIQUE ([visibility_group_id], [parent_question_id], [answer_id])
  );`,
  `ALTER TABLE [requirement_selection_question_visibility_conditions] ADD CONSTRAINT [fk_requirement_selection_question_visibility_conditions_visibility_group_id] FOREIGN KEY ([visibility_group_id]) REFERENCES [requirement_selection_question_visibility_groups] ([id])
    ON DELETE CASCADE
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_selection_question_visibility_conditions] ADD CONSTRAINT [fk_requirement_selection_question_visibility_conditions_parent_question_id] FOREIGN KEY ([parent_question_id]) REFERENCES [requirement_selection_questions] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_selection_question_visibility_conditions] ADD CONSTRAINT [fk_requirement_selection_question_visibility_conditions_answer_id] FOREIGN KEY ([answer_id]) REFERENCES [requirement_selection_answers] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_selection_question_visibility_conditions_group_id]
    ON [requirement_selection_question_visibility_conditions] ([visibility_group_id], [sort_order]);`,
  `CREATE INDEX [idx_requirement_selection_question_visibility_conditions_parent_question_id]
    ON [requirement_selection_question_visibility_conditions] ([parent_question_id]);`,
  `CREATE INDEX [idx_requirement_selection_question_visibility_conditions_answer_id]
    ON [requirement_selection_question_visibility_conditions] ([answer_id]);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'requirement_selection_question_visibility_conditions', N'U') IS NOT NULL DROP TABLE [requirement_selection_question_visibility_conditions];`,
  `IF OBJECT_ID(N'requirement_selection_question_visibility_groups', N'U') IS NOT NULL DROP TABLE [requirement_selection_question_visibility_groups];`,
]

export class RequirementSelectionQuestionVisibility1717000000000 {
  name = 'RequirementSelectionQuestionVisibility1717000000000'
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

export default RequirementSelectionQuestionVisibility1717000000000
