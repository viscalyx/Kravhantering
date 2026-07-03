const UP_STATEMENTS = [
  `IF OBJECT_ID(N'requirement_versions', N'U') IS NOT NULL
    AND COL_LENGTH(N'requirement_versions', N'is_testing_required') IS NOT NULL
    AND COL_LENGTH(N'requirement_versions', N'is_verifiable') IS NULL
    EXEC sp_rename N'requirement_versions.is_testing_required', N'is_verifiable', N'COLUMN';`,
  `IF OBJECT_ID(N'specification_local_requirements', N'U') IS NOT NULL
    AND COL_LENGTH(N'specification_local_requirements', N'is_testing_required') IS NOT NULL
    AND COL_LENGTH(N'specification_local_requirements', N'is_verifiable') IS NULL
    EXEC sp_rename N'specification_local_requirements.is_testing_required', N'is_verifiable', N'COLUMN';`,
  `IF OBJECT_ID(N'requirement_list_column_defaults', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'requiresTesting'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'verifiable'
    )
    UPDATE [requirement_list_column_defaults]
    SET [column_id] = N'verifiable'
    WHERE [column_id] = N'requiresTesting';`,
  `IF OBJECT_ID(N'requirement_list_column_defaults', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'requiresTesting'
    )
    AND EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'verifiable'
    )
    DELETE FROM [requirement_list_column_defaults]
    WHERE [column_id] = N'requiresTesting';`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'requirement_list_column_defaults', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'verifiable'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'requiresTesting'
    )
    UPDATE [requirement_list_column_defaults]
    SET [column_id] = N'requiresTesting'
    WHERE [column_id] = N'verifiable';`,
  `IF OBJECT_ID(N'requirement_list_column_defaults', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'verifiable'
    )
    AND EXISTS (
      SELECT 1
      FROM [requirement_list_column_defaults]
      WHERE [column_id] = N'requiresTesting'
    )
    DELETE FROM [requirement_list_column_defaults]
    WHERE [column_id] = N'verifiable';`,
  `IF OBJECT_ID(N'specification_local_requirements', N'U') IS NOT NULL
    AND COL_LENGTH(N'specification_local_requirements', N'is_verifiable') IS NOT NULL
    AND COL_LENGTH(N'specification_local_requirements', N'is_testing_required') IS NULL
    EXEC sp_rename N'specification_local_requirements.is_verifiable', N'is_testing_required', N'COLUMN';`,
  `IF OBJECT_ID(N'requirement_versions', N'U') IS NOT NULL
    AND COL_LENGTH(N'requirement_versions', N'is_verifiable') IS NOT NULL
    AND COL_LENGTH(N'requirement_versions', N'is_testing_required') IS NULL
    EXEC sp_rename N'requirement_versions.is_verifiable', N'is_testing_required', N'COLUMN';`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class VerifiableRequirementField1719000000000 {
  name = 'VerifiableRequirementField1719000000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default VerifiableRequirementField1719000000000
