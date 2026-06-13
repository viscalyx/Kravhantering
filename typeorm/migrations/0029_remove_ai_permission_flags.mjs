const UP_STATEMENTS = [
  `IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirements_specifications_can_responsible_generate_ai')
    ALTER TABLE [requirements_specifications] DROP CONSTRAINT [df_requirements_specifications_can_responsible_generate_ai];`,
  `IF COL_LENGTH(N'requirements_specifications', N'can_responsible_generate_ai') IS NOT NULL
    ALTER TABLE [requirements_specifications] DROP COLUMN [can_responsible_generate_ai];`,
  `IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_requirement_area_co_authors_can_generate_ai')
    ALTER TABLE [requirement_area_co_authors] DROP CONSTRAINT [df_requirement_area_co_authors_can_generate_ai];`,
  `IF COL_LENGTH(N'requirement_area_co_authors', N'can_generate_ai') IS NOT NULL
    ALTER TABLE [requirement_area_co_authors] DROP COLUMN [can_generate_ai];`,
  `IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_specification_co_authors_can_generate_ai')
    ALTER TABLE [specification_co_authors] DROP CONSTRAINT [df_specification_co_authors_can_generate_ai];`,
  `IF COL_LENGTH(N'specification_co_authors', N'can_generate_ai') IS NOT NULL
    ALTER TABLE [specification_co_authors] DROP COLUMN [can_generate_ai];`,
  `IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'df_access_review_items_can_generate_ai')
    ALTER TABLE [access_review_items] DROP CONSTRAINT [df_access_review_items_can_generate_ai];`,
  `IF COL_LENGTH(N'access_review_items', N'can_generate_ai') IS NOT NULL
    ALTER TABLE [access_review_items] DROP COLUMN [can_generate_ai];`,
]

const DOWN_STATEMENTS = [
  `THROW 51029, 'Cannot roll back AI permission flag removal: dropped flag data is not preserved.', 1;`,
]

export class RemoveAiPermissionFlags1717200000000 {
  name = 'RemoveAiPermissionFlags1717200000000'

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

export default RemoveAiPermissionFlags1717200000000
