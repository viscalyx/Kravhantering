const UP_STATEMENTS = [
  `IF COL_LENGTH(N'requirement_packages', N'purpose_and_scope') IS NULL
    AND COL_LENGTH(N'requirement_packages', N'description') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM [requirement_packages]
      WHERE [description] IS NULL OR LTRIM(RTRIM([description])) = N''
    )
    THROW 51039, 'Cannot migrate requirement_packages: every package must have purpose and scope text before description is renamed.', 1;`,
  `IF COL_LENGTH(N'requirement_packages', N'purpose_and_scope') IS NULL
    AND COL_LENGTH(N'requirement_packages', N'description') IS NOT NULL
    EXEC sp_rename N'requirement_packages.description', N'purpose_and_scope', N'COLUMN';`,
  `IF COL_LENGTH(N'requirement_packages', N'purpose_and_scope') IS NOT NULL
    ALTER TABLE [requirement_packages]
    ALTER COLUMN [purpose_and_scope] nvarchar(max) NOT NULL;`,
]

const DOWN_STATEMENTS = [
  `IF COL_LENGTH(N'requirement_packages', N'purpose_and_scope') IS NOT NULL
    ALTER TABLE [requirement_packages]
    ALTER COLUMN [purpose_and_scope] nvarchar(max) NULL;`,
  `IF COL_LENGTH(N'requirement_packages', N'description') IS NULL
    AND COL_LENGTH(N'requirement_packages', N'purpose_and_scope') IS NOT NULL
    EXEC sp_rename N'requirement_packages.purpose_and_scope', N'description', N'COLUMN';`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RequirementPackagePurposeAndScope1718600000000 {
  name = 'RequirementPackagePurposeAndScope1718600000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default RequirementPackagePurposeAndScope1718600000000
