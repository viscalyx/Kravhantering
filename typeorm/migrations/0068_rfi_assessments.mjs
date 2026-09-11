const UP_STATEMENTS = [
  `ALTER TABLE [specification_rfi_lists] ADD [lock_revision] int NOT NULL
    CONSTRAINT [df_specification_rfi_lists_lock_revision] DEFAULT (0);`,
  `CREATE TABLE [specification_rfi_assessments] (
    [id] int IDENTITY(1,1) NOT NULL CONSTRAINT [pk_specification_rfi_assessments] PRIMARY KEY,
    [specification_id] int NOT NULL,
    [rfi_question_version_id] int NOT NULL,
    [relevance] nvarchar(16) NULL,
    [reason] nvarchar(MAX) NULL,
    [document_reference] nvarchar(2000) NULL,
    [document_url] nvarchar(2000) NULL,
    [created_at] datetime2 NOT NULL,
    [created_by_hsa_id] nvarchar(64) NULL,
    [created_by_display_name] nvarchar(MAX) NULL,
    CONSTRAINT [chk_specification_rfi_assessments_relevance]
      CHECK ([relevance] IS NULL OR [relevance] IN (N'relevant', N'not_relevant'))
  );`,
  `ALTER TABLE [specification_rfi_assessments] ADD CONSTRAINT [fk_specification_rfi_assessments_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_rfi_assessments] ADD CONSTRAINT [fk_specification_rfi_assessments_rfi_question_version_id] FOREIGN KEY ([rfi_question_version_id]) REFERENCES [rfi_question_versions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_specification_rfi_assessments_specification_id]
    ON [specification_rfi_assessments] ([specification_id], [id]);`,
  `CREATE INDEX [idx_specification_rfi_assessments_rfi_question_version_id]
    ON [specification_rfi_assessments] ([rfi_question_version_id]);`,
  `CREATE INDEX [idx_specification_rfi_assessments_created_by_hsa_id]
    ON [specification_rfi_assessments] ([created_by_hsa_id]);`,
  `INSERT INTO [specification_rfi_assessments]
    ([specification_id], [rfi_question_version_id], [relevance], [created_at],
     [created_by_hsa_id], [created_by_display_name])
    SELECT [specification_id], [rfi_question_version_id], [relevance], [changed_at],
      [changed_by_hsa_id], [changed_by_display_name]
    FROM [specification_rfi_question_items]
    WHERE [relevance] IS NOT NULL AND [rfi_question_version_id] IS NOT NULL;`,
]

export class RfiAssessments1789084800000 {
  name = 'RfiAssessments1789084800000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    await queryRunner.query(
      `THROW 51000, 'RFI assessment history cannot be discarded by rollback. Restore a backup instead.', 1;`,
    )
  }
}
