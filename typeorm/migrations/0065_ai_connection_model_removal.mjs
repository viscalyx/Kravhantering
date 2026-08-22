const UP_STATEMENTS = [
  `ALTER TABLE [ai_connection_models]
    ADD [deleted_at] datetime2(3) NULL;`,
]

const DOWN_STATEMENTS = [
  `ALTER TABLE [ai_connection_models]
    DROP COLUMN [deleted_at];`,
]

export class AiConnectionModelRemoval1720800000004 {
  name = 'AiConnectionModelRemoval1720800000004'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiConnectionModelRemoval1720800000004
