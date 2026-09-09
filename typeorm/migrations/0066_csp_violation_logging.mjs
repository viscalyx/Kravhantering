const UP_STATEMENTS = [
  `ALTER TABLE [application_settings] ADD
    [is_csp_violation_logging_enabled] bit NOT NULL
    CONSTRAINT [df_application_settings_is_csp_violation_logging_enabled] DEFAULT 1 WITH VALUES;`,
]
const DOWN_STATEMENTS = [
  `ALTER TABLE [application_settings]
    DROP CONSTRAINT [df_application_settings_is_csp_violation_logging_enabled];`,
  `ALTER TABLE [application_settings]
    DROP COLUMN [is_csp_violation_logging_enabled];`,
]

export class CspViolationLogging1788912000000 {
  name = 'CspViolationLogging1788912000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}
