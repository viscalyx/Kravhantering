const UP_STATEMENTS = [
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'fk_specification_local_requirement_requirement_packages_specification_local_requirement_id'
    )
    ALTER TABLE [specification_local_requirement_requirement_packages]
    DROP CONSTRAINT [fk_specification_local_requirement_requirement_packages_specification_local_requirement_id];`,
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'fk_specification_local_requirement_requirement_packages_requirement_package_id'
    )
    ALTER TABLE [specification_local_requirement_requirement_packages]
    DROP CONSTRAINT [fk_specification_local_requirement_requirement_packages_requirement_package_id];`,
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'idx_specification_local_requirement_requirement_packages_requirement_package_id'
        AND object_id = OBJECT_ID(N'specification_local_requirement_requirement_packages')
    )
    DROP INDEX [idx_specification_local_requirement_requirement_packages_requirement_package_id]
    ON [specification_local_requirement_requirement_packages];`,
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    DROP TABLE [specification_local_requirement_requirement_packages];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NULL
    CREATE TABLE [specification_local_requirement_requirement_packages] (
      [specification_local_requirement_id] int NOT NULL,
      [requirement_package_id] int NOT NULL,
      CONSTRAINT [pk_specification_local_requirement_requirement_packages]
        PRIMARY KEY ([specification_local_requirement_id], [requirement_package_id])
    );`,
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'idx_specification_local_requirement_requirement_packages_requirement_package_id'
        AND object_id = OBJECT_ID(N'specification_local_requirement_requirement_packages')
    )
    CREATE INDEX [idx_specification_local_requirement_requirement_packages_requirement_package_id]
    ON [specification_local_requirement_requirement_packages] ([requirement_package_id]);`,
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'fk_specification_local_requirement_requirement_packages_specification_local_requirement_id'
    )
    ALTER TABLE [specification_local_requirement_requirement_packages]
    ADD CONSTRAINT [fk_specification_local_requirement_requirement_packages_specification_local_requirement_id]
    FOREIGN KEY ([specification_local_requirement_id])
    REFERENCES [specification_local_requirements] ([id])
    ON DELETE CASCADE
    ON UPDATE NO ACTION;`,
  `IF OBJECT_ID(N'specification_local_requirement_requirement_packages', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'fk_specification_local_requirement_requirement_packages_requirement_package_id'
    )
    ALTER TABLE [specification_local_requirement_requirement_packages]
    ADD CONSTRAINT [fk_specification_local_requirement_requirement_packages_requirement_package_id]
    FOREIGN KEY ([requirement_package_id])
    REFERENCES [requirement_packages] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class DropSpecificationLocalRequirementPackages1718700000000 {
  name = 'DropSpecificationLocalRequirementPackages1718700000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default DropSpecificationLocalRequirementPackages1718700000000
