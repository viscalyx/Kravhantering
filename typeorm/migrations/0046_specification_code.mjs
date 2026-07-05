const UP_STATEMENTS = [
  `IF OBJECT_ID(N'requirements_specifications', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'uq_requirements_specifications_unique_id'
        AND object_id = OBJECT_ID(N'requirements_specifications')
    )
    DROP INDEX [uq_requirements_specifications_unique_id]
      ON [requirements_specifications];`,
  `IF OBJECT_ID(N'requirements_specifications', N'U') IS NOT NULL
    AND COL_LENGTH(N'requirements_specifications', N'unique_id') IS NOT NULL
    AND COL_LENGTH(N'requirements_specifications', N'specification_code') IS NULL
    EXEC sp_rename
      N'requirements_specifications.unique_id',
      N'specification_code',
      N'COLUMN';`,
  `IF OBJECT_ID(N'requirements_specifications', N'U') IS NOT NULL
    AND COL_LENGTH(N'requirements_specifications', N'specification_code') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'uq_requirements_specifications_specification_code'
        AND object_id = OBJECT_ID(N'requirements_specifications')
    )
    CREATE UNIQUE INDEX [uq_requirements_specifications_specification_code]
      ON [requirements_specifications] ([specification_code]);`,
  `IF OBJECT_ID(N'rfi_question_suggestions', N'U') IS NOT NULL
    AND COL_LENGTH(N'rfi_question_suggestions', N'source_specification_unique_id') IS NOT NULL
    AND COL_LENGTH(N'rfi_question_suggestions', N'source_specification_code') IS NULL
    EXEC sp_rename
      N'rfi_question_suggestions.source_specification_unique_id',
      N'source_specification_code',
      N'COLUMN';`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'rfi_question_suggestions', N'U') IS NOT NULL
    AND COL_LENGTH(N'rfi_question_suggestions', N'source_specification_code') IS NOT NULL
    AND COL_LENGTH(N'rfi_question_suggestions', N'source_specification_unique_id') IS NULL
    EXEC sp_rename
      N'rfi_question_suggestions.source_specification_code',
      N'source_specification_unique_id',
      N'COLUMN';`,
  `IF OBJECT_ID(N'requirements_specifications', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'uq_requirements_specifications_specification_code'
        AND object_id = OBJECT_ID(N'requirements_specifications')
    )
    DROP INDEX [uq_requirements_specifications_specification_code]
      ON [requirements_specifications];`,
  `IF OBJECT_ID(N'requirements_specifications', N'U') IS NOT NULL
    AND COL_LENGTH(N'requirements_specifications', N'specification_code') IS NOT NULL
    AND COL_LENGTH(N'requirements_specifications', N'unique_id') IS NULL
    EXEC sp_rename
      N'requirements_specifications.specification_code',
      N'unique_id',
      N'COLUMN';`,
  `IF OBJECT_ID(N'requirements_specifications', N'U') IS NOT NULL
    AND COL_LENGTH(N'requirements_specifications', N'unique_id') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'uq_requirements_specifications_unique_id'
        AND object_id = OBJECT_ID(N'requirements_specifications')
    )
    CREATE UNIQUE INDEX [uq_requirements_specifications_unique_id]
      ON [requirements_specifications] ([unique_id]);`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class SpecificationCode1719300000000 {
  name = 'SpecificationCode1719300000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default SpecificationCode1719300000000
