const UP_STATEMENTS = [
  `IF EXISTS (
      SELECT 1
      FROM [archiving_retention_policies]
    )
    AND NOT EXISTS (
      SELECT 1
      FROM [archiving_retention_policies]
      WHERE [policy_key] = N'rfi_questions_retention_delete'
    )
    BEGIN
      INSERT INTO [archiving_retention_policies] (
        [policy_key],
        [information_set],
        [action],
        [age_days],
        [status_condition],
        [is_enabled],
        [decision_reference],
        [last_run_at],
        [created_at],
        [updated_at]
      )
      VALUES (
        N'rfi_questions_retention_delete',
        N'Arkiverade RFI-frågor och historiska RFI-frågeversioner',
        N'delete',
        730,
        N'Arkiverade RFI-frågor och historiska RFI-frågeversioner utan RFI-listreferenser',
        1,
        N'docs/security-privacy/informationsmangder-kravhantering.md#gallrings--och-arkiveringsmatris',
        NULL,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      );
    END`,
]

const DOWN_STATEMENTS = [
  `DELETE FROM [archiving_retention_policies]
    WHERE [policy_key] = N'rfi_questions_retention_delete';`,
]

export class RfiQuestionRetentionPolicy1718300000000 {
  name = 'RfiQuestionRetentionPolicy1718300000000'

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

export default RfiQuestionRetentionPolicy1718300000000
