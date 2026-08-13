const IMPORT_COLUMNS = [
  {
    check:
      '[requirement_import_max_rows] >= 1 AND [requirement_import_max_rows] <= 500',
    defaultValue: 500,
    name: 'requirement_import_max_rows',
  },
  {
    check:
      '[requirement_import_max_proposed_norm_references] >= 0 AND [requirement_import_max_proposed_norm_references] <= 500',
    defaultValue: 500,
    name: 'requirement_import_max_proposed_norm_references',
  },
  {
    check:
      '[requirement_import_max_proposed_needs_references] >= 0 AND [requirement_import_max_proposed_needs_references] <= 500',
    defaultValue: 500,
    name: 'requirement_import_max_proposed_needs_references',
  },
  {
    check:
      '[requirement_import_max_nested_items] >= 0 AND [requirement_import_max_nested_items] <= 200',
    defaultValue: 200,
    name: 'requirement_import_max_nested_items',
  },
  {
    check:
      '[requirement_import_max_json_depth] >= 4 AND [requirement_import_max_json_depth] <= 8',
    defaultValue: 8,
    name: 'requirement_import_max_json_depth',
  },
]

const ADD_IMPORT_COLUMN_STATEMENTS = [
  `IF COL_LENGTH(N'application_settings', N'requirement_import_max_rows') IS NULL
    ALTER TABLE [application_settings]
      ADD [requirement_import_max_rows] int NOT NULL
      CONSTRAINT [df_application_settings_requirement_import_max_rows] DEFAULT (500) WITH VALUES;`,
  `IF COL_LENGTH(N'application_settings', N'requirement_import_max_proposed_norm_references') IS NULL
    ALTER TABLE [application_settings]
      ADD [requirement_import_max_proposed_norm_references] int NOT NULL
      CONSTRAINT [df_application_settings_requirement_import_max_proposed_norm_references] DEFAULT (500) WITH VALUES;`,
  `IF COL_LENGTH(N'application_settings', N'requirement_import_max_proposed_needs_references') IS NULL
    ALTER TABLE [application_settings]
      ADD [requirement_import_max_proposed_needs_references] int NOT NULL
      CONSTRAINT [df_application_settings_requirement_import_max_proposed_needs_references] DEFAULT (500) WITH VALUES;`,
  `IF COL_LENGTH(N'application_settings', N'requirement_import_max_nested_items') IS NULL
    ALTER TABLE [application_settings]
      ADD [requirement_import_max_nested_items] int NOT NULL
      CONSTRAINT [df_application_settings_requirement_import_max_nested_items] DEFAULT (200) WITH VALUES;`,
  `IF COL_LENGTH(N'application_settings', N'requirement_import_max_json_depth') IS NULL
    ALTER TABLE [application_settings]
      ADD [requirement_import_max_json_depth] int NOT NULL
      CONSTRAINT [df_application_settings_requirement_import_max_json_depth] DEFAULT (8) WITH VALUES;`,
]

function addImportCheckStatement(column) {
  return `IF OBJECT_ID(N'chk_application_settings_${column.name}', N'C') IS NULL
    ALTER TABLE [application_settings]
      ADD CONSTRAINT [chk_application_settings_${column.name}]
      CHECK (${column.check});`
}

const UP_STATEMENTS = [
  ...ADD_IMPORT_COLUMN_STATEMENTS,
  ...IMPORT_COLUMNS.map(addImportCheckStatement),
  `IF OBJECT_ID(N'chk_ai_settings_mcp_import_max_rows', N'C') IS NOT NULL
    ALTER TABLE [ai_settings] DROP CONSTRAINT [chk_ai_settings_mcp_import_max_rows];`,
  `UPDATE [ai_settings]
    SET [mcp_import_max_rows] = 500, [updated_at] = SYSUTCDATETIME()
    WHERE [mcp_import_max_rows] > 500;`,
  `ALTER TABLE [ai_settings]
    ADD CONSTRAINT [chk_ai_settings_mcp_import_max_rows]
    CHECK ([mcp_import_max_rows] >= 1 AND [mcp_import_max_rows] <= 500);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'chk_ai_settings_mcp_import_max_rows', N'C') IS NOT NULL
    ALTER TABLE [ai_settings] DROP CONSTRAINT [chk_ai_settings_mcp_import_max_rows];`,
  `ALTER TABLE [ai_settings]
    ADD CONSTRAINT [chk_ai_settings_mcp_import_max_rows]
    CHECK ([mcp_import_max_rows] >= 1 AND [mcp_import_max_rows] <= 5000);`,
  ...[...IMPORT_COLUMNS].reverse().flatMap(column => [
    `IF OBJECT_ID(N'chk_application_settings_${column.name}', N'C') IS NOT NULL
      ALTER TABLE [application_settings]
        DROP CONSTRAINT [chk_application_settings_${column.name}];`,
    `IF OBJECT_ID(N'df_application_settings_${column.name}', N'D') IS NOT NULL
      ALTER TABLE [application_settings]
        DROP CONSTRAINT [df_application_settings_${column.name}];`,
    `IF COL_LENGTH(N'application_settings', N'${column.name}') IS NOT NULL
      ALTER TABLE [application_settings] DROP COLUMN [${column.name}];`,
  ]),
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RequirementImportBudget1720200000000 {
  name = 'RequirementImportBudget1720200000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default RequirementImportBudget1720200000000
