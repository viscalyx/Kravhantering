const UP_STATEMENTS = [
  `CREATE TABLE [access_review_runs] (
  [id] int IDENTITY(1,1) NOT NULL,
  [status] nvarchar(32) NOT NULL CONSTRAINT [df_access_review_runs_status] DEFAULT (N'in_review'),
  [period_start] datetime2(3) NOT NULL,
  [period_end] datetime2(3) NOT NULL,
  [due_at] datetime2(3) NOT NULL,
  [created_at] datetime2(3) NOT NULL,
  [updated_at] datetime2(3) NOT NULL,
  [created_by_hsa_id] nvarchar(64) NULL,
  [created_by_display_name] nvarchar(max) NOT NULL,
  [reviewer_hsa_id] nvarchar(64) NULL,
  [reviewer_display_name] nvarchar(max) NOT NULL,
  [external_evidence_reference] nvarchar(450) NULL,
  [completed_at] datetime2(3) NULL,
  [completed_by_hsa_id] nvarchar(64) NULL,
  [completed_by_display_name] nvarchar(max) NULL,
  CONSTRAINT [pk_access_review_runs] PRIMARY KEY ([id]),
  CONSTRAINT [chk_access_review_runs_status] CHECK ([status] IN (N'draft', N'in_review', N'completed', N'cancelled'))
);`,
  'CREATE INDEX [idx_access_review_runs_status] ON [access_review_runs] ([status]);',
  'CREATE INDEX [idx_access_review_runs_due_at] ON [access_review_runs] ([due_at]);',
  'CREATE INDEX [idx_access_review_runs_reviewer_hsa_id] ON [access_review_runs] ([reviewer_hsa_id]);',
  `CREATE TABLE [access_review_items] (
  [id] int IDENTITY(1,1) NOT NULL,
  [run_id] int NOT NULL,
  [source_key] nvarchar(120) NOT NULL,
  [source_table] nvarchar(120) NOT NULL,
  [principal_hsa_id] nvarchar(64) NULL,
  [principal_display_name] nvarchar(max) NOT NULL,
  [scope_type] nvarchar(64) NOT NULL,
  [scope_key] nvarchar(120) NOT NULL,
  [scope_label] nvarchar(max) NOT NULL,
  [permission_type] nvarchar(64) NOT NULL,
  [can_generate_ai] bit NOT NULL CONSTRAINT [df_access_review_items_can_generate_ai] DEFAULT (0),
  [decision] nvarchar(32) NOT NULL CONSTRAINT [df_access_review_items_decision] DEFAULT (N'pending'),
  [decided_at] datetime2(3) NULL,
  [decided_by_hsa_id] nvarchar(64) NULL,
  [decided_by_display_name] nvarchar(max) NULL,
  [comment] nvarchar(max) NULL,
  [created_at] datetime2(3) NOT NULL,
  CONSTRAINT [pk_access_review_items] PRIMARY KEY ([id]),
  CONSTRAINT [chk_access_review_items_decision] CHECK ([decision] IN (N'pending', N'approved', N'revoke_required', N'changed', N'not_applicable'))
);`,
  'CREATE INDEX [idx_access_review_items_run_id_decision] ON [access_review_items] ([run_id], [decision]);',
  'CREATE INDEX [idx_access_review_items_principal_hsa_id] ON [access_review_items] ([principal_hsa_id]);',
  'CREATE INDEX [idx_access_review_items_source_key] ON [access_review_items] ([source_key]);',
  'CREATE INDEX [idx_access_review_items_decided_by_hsa_id] ON [access_review_items] ([decided_by_hsa_id]);',
  'ALTER TABLE [access_review_items] ADD CONSTRAINT [fk_access_review_items_run_id] FOREIGN KEY ([run_id]) REFERENCES [access_review_runs] ([id]) ON DELETE CASCADE ON UPDATE NO ACTION;',
]

const DOWN_STATEMENTS = [
  "IF OBJECT_ID(N'access_review_items', N'U') IS NOT NULL DROP TABLE [access_review_items];",
  "IF OBJECT_ID(N'access_review_runs', N'U') IS NOT NULL DROP TABLE [access_review_runs];",
]

export class AccessReviewRuns1715200000000 {
  name = 'AccessReviewRuns1715200000000'

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

export default AccessReviewRuns1715200000000
