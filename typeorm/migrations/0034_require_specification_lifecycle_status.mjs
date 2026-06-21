const MANAGEMENT_STATUS_ID = 4

const UP_STATEMENTS = [
  `IF EXISTS (
    SELECT 1
    FROM [specification_lifecycle_statuses]
    WHERE [id] = ${MANAGEMENT_STATUS_ID}
      AND ([name_sv] <> N'Förvaltning' OR [name_en] <> N'Management')
  )
  THROW 51034, N'Cannot require specification lifecycle status: status id 4 must be Förvaltning / Management.', 1;`,

  `IF NOT EXISTS (
    SELECT 1
    FROM [specification_lifecycle_statuses]
    WHERE [id] = ${MANAGEMENT_STATUS_ID}
  )
  AND EXISTS (
    SELECT 1
    FROM [specification_lifecycle_statuses]
    WHERE [name_sv] = N'Förvaltning'
       OR [name_en] = N'Management'
  )
  THROW 51034, N'Cannot require specification lifecycle status: Förvaltning / Management exists with a non-canonical id.', 1;`,

  `IF NOT EXISTS (
    SELECT 1
    FROM [specification_lifecycle_statuses]
    WHERE [id] = ${MANAGEMENT_STATUS_ID}
  )
  BEGIN
    SET IDENTITY_INSERT [specification_lifecycle_statuses] ON;
    INSERT INTO [specification_lifecycle_statuses] ([id], [name_sv], [name_en])
    VALUES (${MANAGEMENT_STATUS_ID}, N'Förvaltning', N'Management');
    SET IDENTITY_INSERT [specification_lifecycle_statuses] OFF;
  END;`,

  `IF EXISTS (
    SELECT 1
    FROM [requirements_specifications]
    WHERE [specification_lifecycle_status_id] IS NULL
  )
  UPDATE [requirements_specifications]
  SET [specification_lifecycle_status_id] = ${MANAGEMENT_STATUS_ID}
  WHERE [specification_lifecycle_status_id] IS NULL;`,

  `IF EXISTS (
    SELECT 1
    FROM [requirements_specifications]
    WHERE [specification_lifecycle_status_id] IS NULL
  )
  THROW 51034, N'Cannot require requirements_specifications.specification_lifecycle_status_id: backfill left null values.', 1;`,

  `IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_specification_lifecycle_status_id')
    ALTER TABLE [requirements_specifications] DROP CONSTRAINT [fk_requirements_specifications_specification_lifecycle_status_id];`,
  `ALTER TABLE [requirements_specifications] ALTER COLUMN [specification_lifecycle_status_id] int NOT NULL;`,
  `ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_specification_lifecycle_status_id] FOREIGN KEY ([specification_lifecycle_status_id]) REFERENCES [specification_lifecycle_statuses] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
]

const DOWN_STATEMENTS = [
  `IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_requirements_specifications_specification_lifecycle_status_id')
    ALTER TABLE [requirements_specifications] DROP CONSTRAINT [fk_requirements_specifications_specification_lifecycle_status_id];`,
  `ALTER TABLE [requirements_specifications] ALTER COLUMN [specification_lifecycle_status_id] int NULL;`,
  `ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_specification_lifecycle_status_id] FOREIGN KEY ([specification_lifecycle_status_id]) REFERENCES [specification_lifecycle_statuses] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
]

export class RequireSpecificationLifecycleStatus1718100000000 {
  name = 'RequireSpecificationLifecycleStatus1718100000000'

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

export default RequireSpecificationLifecycleStatus1718100000000
