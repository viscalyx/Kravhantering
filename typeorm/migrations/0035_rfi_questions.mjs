const UP_STATEMENTS = [
  `CREATE TABLE [rfi_question_sequences] (
    [area_id] int NOT NULL,
    [next_sequence] int NOT NULL CONSTRAINT [df_rfi_question_sequences_next_sequence] DEFAULT (1),
    CONSTRAINT [pk_rfi_question_sequences] PRIMARY KEY ([area_id])
  );`,
  `ALTER TABLE [rfi_question_sequences] ADD CONSTRAINT [fk_rfi_question_sequences_area_id] FOREIGN KEY ([area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,

  `CREATE TABLE [rfi_questions] (
    [id] int IDENTITY(1,1) NOT NULL,
    [question_code] nvarchar(64) NOT NULL,
    [area_id] int NOT NULL,
    [sort_order] int NOT NULL CONSTRAINT [df_rfi_questions_sort_order] DEFAULT (0),
    [is_archived] bit NOT NULL CONSTRAINT [df_rfi_questions_is_archived] DEFAULT (0),
    [archived_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_rfi_questions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_rfi_questions_question_code] UNIQUE ([question_code])
  );`,
  `ALTER TABLE [rfi_questions] ADD CONSTRAINT [fk_rfi_questions_area_id] FOREIGN KEY ([area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_rfi_questions_area_sort_order] ON [rfi_questions] ([area_id], [sort_order]);`,
  `CREATE INDEX [idx_rfi_questions_is_archived] ON [rfi_questions] ([is_archived], [archived_at]);`,

  `CREATE TABLE [rfi_question_versions] (
    [id] int IDENTITY(1,1) NOT NULL,
    [rfi_question_id] int NOT NULL,
    [version_number] int NOT NULL,
    [question_text] nvarchar(max) NOT NULL,
    [help_text] nvarchar(max) NULL,
    [expected_answer_format] nvarchar(max) NULL,
    [is_active] bit NOT NULL CONSTRAINT [df_rfi_question_versions_is_active] DEFAULT (0),
    [created_by_hsa_id] nvarchar(64) NULL,
    [created_by_display_name] nvarchar(max) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_rfi_question_versions] PRIMARY KEY ([id]),
    CONSTRAINT [uq_rfi_question_versions_question_version] UNIQUE ([rfi_question_id], [version_number])
  );`,
  `ALTER TABLE [rfi_question_versions] ADD CONSTRAINT [fk_rfi_question_versions_rfi_question_id] FOREIGN KEY ([rfi_question_id]) REFERENCES [rfi_questions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `CREATE UNIQUE INDEX [uq_rfi_question_versions_active] ON [rfi_question_versions] ([rfi_question_id]) WHERE [is_active] = 1;`,
  `CREATE INDEX [idx_rfi_question_versions_created_by_hsa_id] ON [rfi_question_versions] ([created_by_hsa_id]);`,

  `CREATE TABLE [rfi_question_version_requirement_selection_questions] (
    [rfi_question_version_id] int NOT NULL,
    [requirement_selection_question_id] int NOT NULL,
    CONSTRAINT [pk_rfi_question_version_requirement_selection_questions] PRIMARY KEY ([rfi_question_version_id], [requirement_selection_question_id])
  );`,
  `ALTER TABLE [rfi_question_version_requirement_selection_questions] ADD CONSTRAINT [fk_rfi_question_version_requirement_selection_questions_rfi_question_version_id] FOREIGN KEY ([rfi_question_version_id]) REFERENCES [rfi_question_versions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [rfi_question_version_requirement_selection_questions] ADD CONSTRAINT [fk_rfi_question_version_requirement_selection_questions_requirement_selection_question_id] FOREIGN KEY ([requirement_selection_question_id]) REFERENCES [requirement_selection_questions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_rfi_question_version_requirement_selection_questions_question_id] ON [rfi_question_version_requirement_selection_questions] ([requirement_selection_question_id]);`,

  `CREATE TABLE [rfi_question_version_requirement_packages] (
    [rfi_question_version_id] int NOT NULL,
    [requirement_package_id] int NOT NULL,
    CONSTRAINT [pk_rfi_question_version_requirement_packages] PRIMARY KEY ([rfi_question_version_id], [requirement_package_id])
  );`,
  `ALTER TABLE [rfi_question_version_requirement_packages] ADD CONSTRAINT [fk_rfi_question_version_requirement_packages_rfi_question_version_id] FOREIGN KEY ([rfi_question_version_id]) REFERENCES [rfi_question_versions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [rfi_question_version_requirement_packages] ADD CONSTRAINT [fk_rfi_question_version_requirement_packages_requirement_package_id] FOREIGN KEY ([requirement_package_id]) REFERENCES [requirement_packages] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_rfi_question_version_requirement_packages_package_id] ON [rfi_question_version_requirement_packages] ([requirement_package_id]);`,

  `CREATE TABLE [rfi_question_version_requirements] (
    [rfi_question_version_id] int NOT NULL,
    [requirement_id] int NOT NULL,
    CONSTRAINT [pk_rfi_question_version_requirements] PRIMARY KEY ([rfi_question_version_id], [requirement_id])
  );`,
  `ALTER TABLE [rfi_question_version_requirements] ADD CONSTRAINT [fk_rfi_question_version_requirements_rfi_question_version_id] FOREIGN KEY ([rfi_question_version_id]) REFERENCES [rfi_question_versions] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [rfi_question_version_requirements] ADD CONSTRAINT [fk_rfi_question_version_requirements_requirement_id] FOREIGN KEY ([requirement_id]) REFERENCES [requirements] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_rfi_question_version_requirements_requirement_id] ON [rfi_question_version_requirements] ([requirement_id]);`,

  `CREATE TABLE [specification_rfi_lists] (
    [specification_id] int NOT NULL,
    [is_locked] bit NOT NULL CONSTRAINT [df_specification_rfi_lists_is_locked] DEFAULT (0),
    [locked_at] datetime2(3) NULL,
    [locked_by_hsa_id] nvarchar(64) NULL,
    [locked_by_display_name] nvarchar(max) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_specification_rfi_lists] PRIMARY KEY ([specification_id])
  );`,
  `ALTER TABLE [specification_rfi_lists] ADD CONSTRAINT [fk_specification_rfi_lists_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_specification_rfi_lists_locked_by_hsa_id] ON [specification_rfi_lists] ([locked_by_hsa_id]);`,

  `CREATE TABLE [specification_rfi_question_items] (
    [specification_id] int NOT NULL,
    [rfi_question_id] int NOT NULL,
    [rfi_question_version_id] int NULL,
    [is_included] bit NOT NULL CONSTRAINT [df_specification_rfi_question_items_is_included] DEFAULT (1),
    [relevance] nvarchar(16) NULL,
    [changed_at] datetime2(3) NOT NULL,
    [changed_by_hsa_id] nvarchar(64) NULL,
    [changed_by_display_name] nvarchar(max) NULL,
    CONSTRAINT [pk_specification_rfi_question_items] PRIMARY KEY ([specification_id], [rfi_question_id]),
    CONSTRAINT [chk_specification_rfi_question_items_relevance] CHECK ([relevance] IS NULL OR [relevance] IN (N'relevant', N'not_relevant'))
  );`,
  `ALTER TABLE [specification_rfi_question_items] ADD CONSTRAINT [fk_specification_rfi_question_items_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_rfi_question_items] ADD CONSTRAINT [fk_specification_rfi_question_items_rfi_question_id] FOREIGN KEY ([rfi_question_id]) REFERENCES [rfi_questions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_rfi_question_items] ADD CONSTRAINT [fk_specification_rfi_question_items_rfi_question_version_id] FOREIGN KEY ([rfi_question_version_id]) REFERENCES [rfi_question_versions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_specification_rfi_question_items_version_id] ON [specification_rfi_question_items] ([rfi_question_version_id]);`,
  `CREATE INDEX [idx_specification_rfi_question_items_changed_by_hsa_id] ON [specification_rfi_question_items] ([changed_by_hsa_id]);`,

  `CREATE TABLE [rfi_question_suggestions] (
    [id] int IDENTITY(1,1) NOT NULL,
    [area_id] int NOT NULL,
    [rfi_question_id] int NULL,
    [specification_id] int NULL,
    [source_specification_unique_id] nvarchar(450) NULL,
    [source_specification_name] nvarchar(max) NULL,
    [content] nvarchar(max) NOT NULL,
    [is_review_requested] bit NOT NULL CONSTRAINT [df_rfi_question_suggestions_is_review_requested] DEFAULT (0),
    [review_requested_at] datetime2(3) NULL,
    [resolution] int NULL,
    [resolution_motivation] nvarchar(max) NULL,
    [created_by_hsa_id] nvarchar(64) NULL,
    [created_by_display_name] nvarchar(max) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NULL,
    [resolved_by_hsa_id] nvarchar(64) NULL,
    [resolved_by_display_name] nvarchar(max) NULL,
    [resolved_at] datetime2(3) NULL,
    CONSTRAINT [pk_rfi_question_suggestions] PRIMARY KEY ([id]),
    CONSTRAINT [chk_rfi_question_suggestions_resolution] CHECK ([resolution] IS NULL OR [resolution] IN (1, 2))
  );`,
  `ALTER TABLE [rfi_question_suggestions] ADD CONSTRAINT [fk_rfi_question_suggestions_area_id] FOREIGN KEY ([area_id]) REFERENCES [requirement_areas] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [rfi_question_suggestions] ADD CONSTRAINT [fk_rfi_question_suggestions_rfi_question_id] FOREIGN KEY ([rfi_question_id]) REFERENCES [rfi_questions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [rfi_question_suggestions] ADD CONSTRAINT [fk_rfi_question_suggestions_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_rfi_question_suggestions_area_id] ON [rfi_question_suggestions] ([area_id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_rfi_question_id] ON [rfi_question_suggestions] ([rfi_question_id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_specification_id] ON [rfi_question_suggestions] ([specification_id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_created_by_hsa_id] ON [rfi_question_suggestions] ([created_by_hsa_id]);`,
  `CREATE INDEX [idx_rfi_question_suggestions_resolved_by_hsa_id] ON [rfi_question_suggestions] ([resolved_by_hsa_id]);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'rfi_question_suggestions', N'U') IS NOT NULL DROP TABLE [rfi_question_suggestions];`,
  `IF OBJECT_ID(N'specification_rfi_question_items', N'U') IS NOT NULL DROP TABLE [specification_rfi_question_items];`,
  `IF OBJECT_ID(N'specification_rfi_lists', N'U') IS NOT NULL DROP TABLE [specification_rfi_lists];`,
  `IF OBJECT_ID(N'rfi_question_version_requirements', N'U') IS NOT NULL DROP TABLE [rfi_question_version_requirements];`,
  `IF OBJECT_ID(N'rfi_question_version_requirement_packages', N'U') IS NOT NULL DROP TABLE [rfi_question_version_requirement_packages];`,
  `IF OBJECT_ID(N'rfi_question_version_requirement_selection_questions', N'U') IS NOT NULL DROP TABLE [rfi_question_version_requirement_selection_questions];`,
  `IF OBJECT_ID(N'rfi_question_versions', N'U') IS NOT NULL DROP TABLE [rfi_question_versions];`,
  `IF OBJECT_ID(N'rfi_questions', N'U') IS NOT NULL DROP TABLE [rfi_questions];`,
  `IF OBJECT_ID(N'rfi_question_sequences', N'U') IS NOT NULL DROP TABLE [rfi_question_sequences];`,
]

export class RfiQuestions1718200000000 {
  name = 'RfiQuestions1718200000000'
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

export default RfiQuestions1718200000000
