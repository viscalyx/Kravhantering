const UP_STATEMENTS = [
  `ALTER TABLE [requirements_specifications] ADD
    [establishment_status] nvarchar(20) NOT NULL CONSTRAINT [df_requirements_specifications_establishment_status] DEFAULT N'editable',
    [agreement_reference] nvarchar(2000) NULL,
    [agreement_reason] nvarchar(MAX) NULL,
    [agreement_date] date NULL,
    [assessed_at] datetime2 NULL,
    [assessed_by_hsa_id] nvarchar(64) NULL,
    [assessment_reason] nvarchar(MAX) NULL,
    [established_at] datetime2 NULL,
    [established_by_hsa_id] nvarchar(64) NULL,
    [original_content_json] nvarchar(MAX) NULL,
    [ended_at] datetime2 NULL,
    [ended_by_hsa_id] nvarchar(64) NULL,
    [agreement_end_date] date NULL,
    [agreement_end_reason] nvarchar(MAX) NULL;`,
  `UPDATE [requirements_specifications] SET [establishment_status] = N'assessment';`,
  `ALTER TABLE [requirements_specifications] ADD CONSTRAINT [chk_requirements_specifications_establishment_status]
    CHECK ([establishment_status] IN (N'assessment', N'editable', N'established', N'ended'));`,
  `ALTER TABLE [requirements_specification_items] ADD
    [valid_from] datetime2 NOT NULL CONSTRAINT [df_requirements_specification_items_valid_from] DEFAULT SYSUTCDATETIME(),
    [valid_until] datetime2 NULL,
    [is_reassessment_required] bit NOT NULL CONSTRAINT [df_requirements_specification_items_is_reassessment_required] DEFAULT 0,
    [binding_reason] nvarchar(MAX) NULL,
    [binding_created_by_hsa_id] nvarchar(64) NULL;`,
  `UPDATE [requirements_specification_items] SET [valid_from] = [created_at];`,
  `DROP INDEX [uq_requirements_specification_items_specification_requirement] ON [requirements_specification_items];`,
  `CREATE UNIQUE INDEX [uq_requirements_specification_items_specification_requirement]
    ON [requirements_specification_items] ([requirements_specification_id], [requirement_id]) WHERE [valid_until] IS NULL;`,
  `ALTER TABLE [specification_local_requirements] ADD
    [valid_from] datetime2 NOT NULL CONSTRAINT [df_specification_local_requirements_valid_from] DEFAULT SYSUTCDATETIME(),
    [valid_until] datetime2 NULL,
    [is_reassessment_required] bit NOT NULL CONSTRAINT [df_specification_local_requirements_is_reassessment_required] DEFAULT 0,
    [binding_reason] nvarchar(MAX) NULL,
    [binding_created_by_hsa_id] nvarchar(64) NULL;`,
  `UPDATE [specification_local_requirements] SET [valid_from] = [created_at];`,
  `DROP INDEX [uq_specification_local_requirements_specification_id_sequence_number] ON [specification_local_requirements];`,
  `DROP INDEX [uq_specification_local_requirements_specification_id_unique_id] ON [specification_local_requirements];`,
  `CREATE UNIQUE INDEX [uq_specification_local_requirements_specification_id_sequence_number]
    ON [specification_local_requirements] ([specification_id], [sequence_number]) WHERE [valid_until] IS NULL;`,
  `CREATE UNIQUE INDEX [uq_specification_local_requirements_specification_id_unique_id]
    ON [specification_local_requirements] ([specification_id], [unique_id]) WHERE [valid_until] IS NULL;`,
  `CREATE TABLE [specification_amendments] (
    [id] int IDENTITY(1,1) NOT NULL CONSTRAINT [pk_specification_amendments] PRIMARY KEY,
    [specification_id] int NOT NULL,
    [reason] nvarchar(MAX) NOT NULL,
    [agreement_reference] nvarchar(2000) NOT NULL,
    [effective_date] date NOT NULL,
    [effective_at] datetime2 NULL,
    [created_at] datetime2 NOT NULL,
    [created_by_hsa_id] nvarchar(64) NULL,
    [decided_at] datetime2 NULL,
    [decided_by_hsa_id] nvarchar(64) NULL,
    [cancelled_at] datetime2 NULL,
    [cancelled_by_hsa_id] nvarchar(64) NULL,
    [cancellation_reason] nvarchar(MAX) NULL,
    [changes_json] nvarchar(MAX) NOT NULL,
    [replaces_amendment_id] int NULL
  );`,
  `ALTER TABLE [specification_amendments] ADD CONSTRAINT [fk_specification_amendments_replaces_amendment_id] FOREIGN KEY ([replaces_amendment_id]) REFERENCES [specification_amendments] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_amendments] ADD CONSTRAINT [fk_specification_amendments_specification_id] FOREIGN KEY ([specification_id]) REFERENCES [requirements_specifications] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_specification_amendments_specification_id] ON [specification_amendments] ([specification_id]);`,
  `ALTER TABLE [requirements_specification_items] ADD [specification_amendment_id] int NULL;`,
  `ALTER TABLE [requirements_specification_items] ADD CONSTRAINT [fk_requirements_specification_items_specification_amendment_id] FOREIGN KEY ([specification_amendment_id]) REFERENCES [specification_amendments] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_local_requirements] ADD [specification_amendment_id] int NULL;`,
  `ALTER TABLE [specification_local_requirements] ADD CONSTRAINT [fk_specification_local_requirements_specification_amendment_id] FOREIGN KEY ([specification_amendment_id]) REFERENCES [specification_amendments] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE VIEW [current_requirement_applications] AS
    SELECT * FROM [requirements_specification_items]
    WHERE [valid_from] <= SYSUTCDATETIME() AND ([valid_until] IS NULL OR [valid_until] > SYSUTCDATETIME());`,
  `CREATE VIEW [current_specification_local_requirements] AS
    SELECT * FROM [specification_local_requirements]
    WHERE [valid_from] <= SYSUTCDATETIME() AND ([valid_until] IS NULL OR [valid_until] > SYSUTCDATETIME());`,
  `ALTER TABLE [requirements_specification_items] ADD
    [reassessed_at] datetime2 NULL,
    [reassessed_by_hsa_id] nvarchar(64) NULL,
    [reassessment_reason] nvarchar(MAX) NULL,
    [needs_reference_snapshot] nvarchar(MAX) NULL;`,
  `ALTER TABLE [specification_local_requirements] ADD
    [reassessed_at] datetime2 NULL,
    [reassessed_by_hsa_id] nvarchar(64) NULL,
    [reassessment_reason] nvarchar(MAX) NULL,
    [needs_reference_snapshot] nvarchar(MAX) NULL;`,
  `EXEC sp_refreshview N'current_requirement_applications';`,
  `EXEC sp_refreshview N'current_specification_local_requirements';`,
]

export class SpecificationAgreements1789257600000 {
  name = 'SpecificationAgreements1789257600000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    await queryRunner.query(
      `THROW 51000, 'Agreement history cannot be discarded by rollback. Restore a backup instead.', 1;`,
    )
  }
}
