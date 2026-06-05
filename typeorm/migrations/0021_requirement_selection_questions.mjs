const UP_STATEMENTS = [
  `IF EXISTS (
    SELECT 1
    FROM [requirement_packages] pkg
    LEFT JOIN [owners] owner_record ON owner_record.[id] = pkg.[owner_id]
    WHERE owner_record.[hsa_id] IS NULL OR LTRIM(RTRIM(owner_record.[hsa_id])) = N''
  )
  THROW 51021, 'Cannot migrate requirement_packages: every package must have an owner with a real HSA-ID.', 1;`,

  `ALTER TABLE [requirement_packages] ADD [name] nvarchar(max) NULL;`,
  `ALTER TABLE [requirement_packages] ADD [description] nvarchar(max) NULL;`,
  `ALTER TABLE [requirement_packages] ADD [lead_hsa_id] nvarchar(64) NULL;`,
  `ALTER TABLE [requirement_packages] ADD [lead_display_name] nvarchar(max) NULL;`,
  `ALTER TABLE [requirement_packages] ADD [is_archived] bit NOT NULL CONSTRAINT [df_requirement_packages_is_archived] DEFAULT (0);`,

  `UPDATE pkg
  SET
    [name] = COALESCE(NULLIF(LTRIM(RTRIM(pkg.[name_sv])), N''), NULLIF(LTRIM(RTRIM(pkg.[name_en])), N'')),
    [description] = COALESCE(NULLIF(LTRIM(RTRIM(pkg.[description_sv])), N''), NULLIF(LTRIM(RTRIM(pkg.[description_en])), N'')),
    [lead_hsa_id] = owner_record.[hsa_id],
    [lead_display_name] = NULLIF(LTRIM(RTRIM(CONCAT(owner_record.[first_name], N' ', owner_record.[last_name]))), N'')
  FROM [requirement_packages] pkg
  INNER JOIN [owners] owner_record ON owner_record.[id] = pkg.[owner_id];`,

  `UPDATE [requirement_packages]
  SET [lead_display_name] = [lead_hsa_id]
  WHERE [lead_display_name] IS NULL;`,

  `ALTER TABLE [requirement_packages] ALTER COLUMN [name] nvarchar(max) NOT NULL;`,
  `ALTER TABLE [requirement_packages] ALTER COLUMN [lead_hsa_id] nvarchar(64) NOT NULL;`,
  `ALTER TABLE [requirement_packages] ALTER COLUMN [lead_display_name] nvarchar(max) NOT NULL;`,

  `ALTER TABLE [requirement_packages] DROP CONSTRAINT [fk_requirement_packages_owner_id];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [owner_id];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [name_sv];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [name_en];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [description_sv];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [description_en];`,
  `CREATE INDEX [idx_requirement_packages_lead_hsa_id] ON [requirement_packages] ([lead_hsa_id]);`,
  `CREATE INDEX [idx_requirement_packages_is_archived] ON [requirement_packages] ([is_archived]);`,

  `CREATE TABLE [requirement_selection_question_sequences] (
    [area_id] int NOT NULL,
    [next_sequence] int NOT NULL CONSTRAINT [df_requirement_selection_question_sequences_next_sequence] DEFAULT (1),
    CONSTRAINT [pk_requirement_selection_question_sequences] PRIMARY KEY ([area_id])
  );`,
  `ALTER TABLE [requirement_selection_question_sequences] ADD CONSTRAINT [fk_requirement_selection_question_sequences_area_id] FOREIGN KEY ([area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,

  `CREATE TABLE [requirement_selection_questions] (
    [id] int IDENTITY(1,1) NOT NULL,
    [question_code] nvarchar(64) NOT NULL,
    [area_id] int NOT NULL,
    [question_text] nvarchar(max) NOT NULL,
    [help_text] nvarchar(max) NULL,
    [selection_type] nvarchar(16) NOT NULL,
    [sort_order] int NOT NULL CONSTRAINT [df_requirement_selection_questions_sort_order] DEFAULT (0),
    [is_active] bit NOT NULL CONSTRAINT [df_requirement_selection_questions_is_active] DEFAULT (0),
    [is_archived] bit NOT NULL CONSTRAINT [df_requirement_selection_questions_is_archived] DEFAULT (0),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_requirement_selection_questions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_requirement_selection_questions_question_code] UNIQUE ([question_code]),
    CONSTRAINT [chk_requirement_selection_questions_selection_type] CHECK ([selection_type] IN (N'single', N'multiple')),
    CONSTRAINT [chk_requirement_selection_questions_state] CHECK (NOT ([is_active] = 1 AND [is_archived] = 1))
  );`,
  `ALTER TABLE [requirement_selection_questions] ADD CONSTRAINT [fk_requirement_selection_questions_area_id] FOREIGN KEY ([area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_selection_questions_area_sort_order] ON [requirement_selection_questions] ([area_id], [sort_order]);`,
  `CREATE INDEX [idx_requirement_selection_questions_state] ON [requirement_selection_questions] ([is_active], [is_archived]);`,

  `CREATE TABLE [requirement_selection_answers] (
    [id] int IDENTITY(1,1) NOT NULL,
    [question_id] int NOT NULL,
    [answer_text] nvarchar(max) NOT NULL,
    [description] nvarchar(max) NULL,
    [sort_order] int NOT NULL CONSTRAINT [df_requirement_selection_answers_sort_order] DEFAULT (0),
    [is_no_requirement_selection] bit NOT NULL CONSTRAINT [df_requirement_selection_answers_is_no_requirement_selection] DEFAULT (0),
    [is_active] bit NOT NULL CONSTRAINT [df_requirement_selection_answers_is_active] DEFAULT (1),
    [is_archived] bit NOT NULL CONSTRAINT [df_requirement_selection_answers_is_archived] DEFAULT (0),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_requirement_selection_answers] PRIMARY KEY ([id]),
    CONSTRAINT [chk_requirement_selection_answers_state] CHECK (NOT ([is_active] = 1 AND [is_archived] = 1))
  );`,
  `ALTER TABLE [requirement_selection_answers] ADD CONSTRAINT [fk_requirement_selection_answers_question_id] FOREIGN KEY ([question_id]) REFERENCES [requirement_selection_questions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_selection_answers_question_sort_order] ON [requirement_selection_answers] ([question_id], [sort_order]);`,
  `CREATE INDEX [idx_requirement_selection_answers_state] ON [requirement_selection_answers] ([is_active], [is_archived]);`,

  `CREATE TABLE [requirement_selection_answer_packages] (
    [answer_id] int NOT NULL,
    [requirement_package_id] int NOT NULL,
    CONSTRAINT [pk_requirement_selection_answer_packages] PRIMARY KEY ([answer_id], [requirement_package_id])
  );`,
  `ALTER TABLE [requirement_selection_answer_packages] ADD CONSTRAINT [fk_requirement_selection_answer_packages_answer_id] FOREIGN KEY ([answer_id]) REFERENCES [requirement_selection_answers] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_selection_answer_packages] ADD CONSTRAINT [fk_requirement_selection_answer_packages_requirement_package_id] FOREIGN KEY ([requirement_package_id]) REFERENCES [requirement_packages] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_selection_answer_packages_package_id] ON [requirement_selection_answer_packages] ([requirement_package_id]);`,

  `CREATE TABLE [requirement_selection_answer_requirements] (
    [answer_id] int NOT NULL,
    [requirement_id] int NOT NULL,
    CONSTRAINT [pk_requirement_selection_answer_requirements] PRIMARY KEY ([answer_id], [requirement_id])
  );`,
  `ALTER TABLE [requirement_selection_answer_requirements] ADD CONSTRAINT [fk_requirement_selection_answer_requirements_answer_id] FOREIGN KEY ([answer_id]) REFERENCES [requirement_selection_answers] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_selection_answer_requirements] ADD CONSTRAINT [fk_requirement_selection_answer_requirements_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_selection_answer_requirements_requirement_id] ON [requirement_selection_answer_requirements] ([requirement_id]);`,

  `CREATE TABLE [specification_requirement_selection_answers] (
    [specification_id] int NOT NULL,
    [question_id] int NOT NULL,
    [answer_id] int NOT NULL,
    [is_filter_active] bit NOT NULL CONSTRAINT [df_specification_requirement_selection_answers_is_filter_active] DEFAULT (1),
    [changed_at] datetime2(3) NOT NULL,
    [changed_by_hsa_id] nvarchar(64) NULL,
    [changed_by_display_name] nvarchar(max) NULL,
    CONSTRAINT [pk_specification_requirement_selection_answers] PRIMARY KEY ([specification_id], [question_id], [answer_id])
  );`,
  `ALTER TABLE [specification_requirement_selection_answers] ADD CONSTRAINT [fk_specification_requirement_selection_answers_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_requirement_selection_answers] ADD CONSTRAINT [fk_specification_requirement_selection_answers_question_id] FOREIGN KEY ([question_id]) REFERENCES [requirement_selection_questions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_requirement_selection_answers] ADD CONSTRAINT [fk_specification_requirement_selection_answers_answer_id] FOREIGN KEY ([answer_id]) REFERENCES [requirement_selection_answers] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_specification_requirement_selection_answers_filter] ON [specification_requirement_selection_answers] ([specification_id], [is_filter_active]);`,
  `CREATE INDEX [idx_specification_requirement_selection_answers_changed_by_hsa_id] ON [specification_requirement_selection_answers] ([changed_by_hsa_id]);`,
  `CREATE INDEX [idx_specification_requirement_selection_answers_answer_id] ON [specification_requirement_selection_answers] ([answer_id]);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'specification_requirement_selection_answers', N'U') IS NOT NULL DROP TABLE [specification_requirement_selection_answers];`,
  `IF OBJECT_ID(N'requirement_selection_answer_requirements', N'U') IS NOT NULL DROP TABLE [requirement_selection_answer_requirements];`,
  `IF OBJECT_ID(N'requirement_selection_answer_packages', N'U') IS NOT NULL DROP TABLE [requirement_selection_answer_packages];`,
  `IF OBJECT_ID(N'requirement_selection_answers', N'U') IS NOT NULL DROP TABLE [requirement_selection_answers];`,
  `IF OBJECT_ID(N'requirement_selection_questions', N'U') IS NOT NULL DROP TABLE [requirement_selection_questions];`,
  `IF OBJECT_ID(N'requirement_selection_question_sequences', N'U') IS NOT NULL DROP TABLE [requirement_selection_question_sequences];`,
  `DROP INDEX [idx_requirement_packages_is_archived] ON [requirement_packages];`,
  `DROP INDEX [idx_requirement_packages_lead_hsa_id] ON [requirement_packages];`,
  `ALTER TABLE [requirement_packages] ADD
    [name_sv] nvarchar(max) NULL,
    [name_en] nvarchar(max) NULL,
    [description_sv] nvarchar(max) NULL,
    [description_en] nvarchar(max) NULL,
    [owner_id] int NULL;`,
  `UPDATE [requirement_packages]
  SET
    [name_sv] = [name],
    [name_en] = [name],
    [description_sv] = [description],
    [description_en] = [description];`,
  `ALTER TABLE [requirement_packages] ALTER COLUMN [name_sv] nvarchar(max) NOT NULL;`,
  `ALTER TABLE [requirement_packages] ALTER COLUMN [name_en] nvarchar(max) NOT NULL;`,
  `ALTER TABLE [requirement_packages]
    ADD CONSTRAINT [fk_requirement_packages_owner_id]
    FOREIGN KEY ([owner_id]) REFERENCES [owners] ([id]) ON DELETE NO ACTION;`,
  `ALTER TABLE [requirement_packages] DROP CONSTRAINT [df_requirement_packages_is_archived];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [is_archived];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [lead_display_name];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [lead_hsa_id];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [description];`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [name];`,
]

export class RequirementSelectionQuestions1716400000000 {
  name = 'RequirementSelectionQuestions1716400000000'
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

export default RequirementSelectionQuestions1716400000000
