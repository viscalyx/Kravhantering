const UP_STATEMENTS = [
  `IF OBJECT_ID(N'application_settings', N'U') IS NULL
    CREATE TABLE [application_settings] (
      [id] int IDENTITY(1,1) NOT NULL,
      [csv_export_max_requirements] int NOT NULL CONSTRAINT [df_application_settings_csv_export_max_requirements] DEFAULT (1000),
      [csv_export_max_file_bytes] int NOT NULL CONSTRAINT [df_application_settings_csv_export_max_file_bytes] DEFAULT (104857600),
      [csv_export_concurrency_per_node] int NOT NULL CONSTRAINT [df_application_settings_csv_export_concurrency_per_node] DEFAULT (5),
      [csv_export_timeout_seconds] int NOT NULL CONSTRAINT [df_application_settings_csv_export_timeout_seconds] DEFAULT (120),
      [pdf_report_max_requirements] int NOT NULL CONSTRAINT [df_application_settings_pdf_report_max_requirements] DEFAULT (1000),
      [pdf_report_max_file_bytes] int NOT NULL CONSTRAINT [df_application_settings_pdf_report_max_file_bytes] DEFAULT (52428800),
      [pdf_report_concurrency_per_node] int NOT NULL CONSTRAINT [df_application_settings_pdf_report_concurrency_per_node] DEFAULT (3),
      [pdf_report_timeout_seconds] int NOT NULL CONSTRAINT [df_application_settings_pdf_report_timeout_seconds] DEFAULT (180),
      [pdf_worker_memory_mib] int NOT NULL CONSTRAINT [df_application_settings_pdf_worker_memory_mib] DEFAULT (512),
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_application_settings] PRIMARY KEY ([id]),
      CONSTRAINT [chk_application_settings_id] CHECK ([id] = 1),
      CONSTRAINT [chk_application_settings_csv_export_max_requirements] CHECK ([csv_export_max_requirements] >= 1 AND [csv_export_max_requirements] <= 5000),
      CONSTRAINT [chk_application_settings_csv_export_max_file_bytes] CHECK ([csv_export_max_file_bytes] >= 1048576 AND [csv_export_max_file_bytes] <= 1073741824 AND [csv_export_max_file_bytes] % 1048576 = 0),
      CONSTRAINT [chk_application_settings_csv_export_concurrency_per_node] CHECK ([csv_export_concurrency_per_node] >= 1 AND [csv_export_concurrency_per_node] <= 20),
      CONSTRAINT [chk_application_settings_csv_export_timeout_seconds] CHECK ([csv_export_timeout_seconds] >= 10 AND [csv_export_timeout_seconds] <= 600),
      CONSTRAINT [chk_application_settings_pdf_report_max_requirements] CHECK ([pdf_report_max_requirements] >= 1 AND [pdf_report_max_requirements] <= 1000),
      CONSTRAINT [chk_application_settings_pdf_report_max_file_bytes] CHECK ([pdf_report_max_file_bytes] >= 1048576 AND [pdf_report_max_file_bytes] <= 536870912 AND [pdf_report_max_file_bytes] % 1048576 = 0),
      CONSTRAINT [chk_application_settings_pdf_report_concurrency_per_node] CHECK ([pdf_report_concurrency_per_node] >= 1 AND [pdf_report_concurrency_per_node] <= 10),
      CONSTRAINT [chk_application_settings_pdf_report_timeout_seconds] CHECK ([pdf_report_timeout_seconds] >= 10 AND [pdf_report_timeout_seconds] <= 600),
      CONSTRAINT [chk_application_settings_pdf_worker_memory_mib] CHECK ([pdf_worker_memory_mib] >= 128 AND [pdf_worker_memory_mib] <= 4096)
    );`,
  `IF OBJECT_ID(N'application_settings', N'U') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM [application_settings] WHERE [id] = 1)
    BEGIN
      SET IDENTITY_INSERT [application_settings] ON;
      INSERT INTO [application_settings] (
        [id],
        [csv_export_max_requirements],
        [csv_export_max_file_bytes],
        [csv_export_concurrency_per_node],
        [csv_export_timeout_seconds],
        [pdf_report_max_requirements],
        [pdf_report_max_file_bytes],
        [pdf_report_concurrency_per_node],
        [pdf_report_timeout_seconds],
        [pdf_worker_memory_mib],
        [created_at],
        [updated_at]
      )
      VALUES (
        1, 1000, 104857600, 5, 120, 1000, 52428800, 3, 180, 512,
        SYSUTCDATETIME(), SYSUTCDATETIME()
      );
      SET IDENTITY_INSERT [application_settings] OFF;
    END;`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'application_settings', N'U') IS NOT NULL
    DROP TABLE [application_settings];`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class ApplicationSettings1719500000000 {
  name = 'ApplicationSettings1719500000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default ApplicationSettings1719500000000
