const UP_STATEMENTS = [
  `IF EXISTS (
    SELECT 1
    FROM [requirements_specifications]
    WHERE [responsible_hsa_id] IS NULL
  )
  THROW 51031, 'Cannot require specification lead HSA-ID: every requirements specification must have responsible_hsa_id before this migration.', 1;`,

  `IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_responsible_hsa_id')
    ALTER TABLE [requirements_specifications] DROP CONSTRAINT [fk_requirements_specifications_responsible_hsa_id];`,
  `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirements_specifications_responsible_hsa_id' AND object_id = OBJECT_ID(N'requirements_specifications'))
    DROP INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications];`,
  `ALTER TABLE [requirements_specifications] ALTER COLUMN [responsible_hsa_id] nvarchar(31) NOT NULL;`,
  `CREATE INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications] ([responsible_hsa_id]);`,
  `ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_responsible_hsa_id] FOREIGN KEY ([responsible_hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
]

const DOWN_STATEMENTS = [
  `IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_responsible_hsa_id')
    ALTER TABLE [requirements_specifications] DROP CONSTRAINT [fk_requirements_specifications_responsible_hsa_id];`,
  `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_requirements_specifications_responsible_hsa_id' AND object_id = OBJECT_ID(N'requirements_specifications'))
    DROP INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications];`,
  `ALTER TABLE [requirements_specifications] ALTER COLUMN [responsible_hsa_id] nvarchar(31) NULL;`,
  `CREATE INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications] ([responsible_hsa_id]);`,
  `ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_responsible_hsa_id] FOREIGN KEY ([responsible_hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
]

export class RequireSpecificationResponsibleHsaId1717400000000 {
  name = 'RequireSpecificationResponsibleHsaId1717400000000'

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

export default RequireSpecificationResponsibleHsaId1717400000000
