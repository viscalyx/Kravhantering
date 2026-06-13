const UP_STATEMENTS = [
  "IF COL_LENGTH(N'requirements_specification_items', N'unused_1') IS NOT NULL ALTER TABLE [requirements_specification_items] DROP COLUMN [unused_1];",
]

const DOWN_STATEMENTS = [
  "IF COL_LENGTH(N'requirements_specification_items', N'unused_1') IS NULL ALTER TABLE [requirements_specification_items] ADD [unused_1] nvarchar(max) NULL;",
]

export class RemoveRequirementsSpecificationItemsUnusedColumn1717300000000 {
  name = 'RemoveRequirementsSpecificationItemsUnusedColumn1717300000000'

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

export default RemoveRequirementsSpecificationItemsUnusedColumn1717300000000
