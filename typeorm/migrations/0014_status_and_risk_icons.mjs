const UP_STATEMENTS = [
  'ALTER TABLE [requirement_statuses] ADD [icon_name] nvarchar(64) NULL;',
  'ALTER TABLE [specification_item_statuses] ADD [icon_name] nvarchar(64) NULL;',
  'ALTER TABLE [risk_levels] ADD [icon_name] nvarchar(64) NULL;',
]

const DOWN_STATEMENTS = [
  'ALTER TABLE [risk_levels] DROP COLUMN [icon_name];',
  'ALTER TABLE [specification_item_statuses] DROP COLUMN [icon_name];',
  'ALTER TABLE [requirement_statuses] DROP COLUMN [icon_name];',
]

export class StatusAndRiskIcons1716100000000 {
  name = 'StatusAndRiskIcons1716100000000'

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

export default StatusAndRiskIcons1716100000000
