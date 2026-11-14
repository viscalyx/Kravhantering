const UP_STATEMENTS = [
  `CREATE TABLE [optional_catalog_initializations] (
      [id] int NOT NULL CONSTRAINT [pk_optional_catalog_initializations] PRIMARY KEY,
      [created_at] datetime2 NOT NULL,
      [completed_at] datetime2 NULL,
      CONSTRAINT [chk_optional_catalog_initializations_id] CHECK ([id] = 1)
    );`,
  `INSERT INTO [optional_catalog_initializations] ([id], [created_at], [completed_at])
       VALUES (1, SYSUTCDATETIME(), CASE WHEN @0 = 1 THEN NULL ELSE SYSUTCDATETIME() END);`,
]

export class OptionalCatalogInitialization1789603200000 {
  name = 'OptionalCatalogInitialization1789603200000'

  async up(queryRunner) {
    const fresh =
      queryRunner.connection?.options?.kravhanteringFreshInstallation === true
    // Persist the pre-migration distinction inside TypeORM's migration transaction.
    // Separate seed processes and interrupted retries use this row, never a flag.
    for (const statement of UP_STATEMENTS) {
      await queryRunner.query(statement, [fresh ? 1 : 0])
    }
  }

  async down() {
    throw new Error(
      'Optional initialization history must be preserved. Restore a verified backup to roll back.',
    )
  }
}

export default OptionalCatalogInitialization1789603200000
