const PLACEHOLDER_GIVEN_NAME = '(saknar namn, kräver nytt uppslag)'

const VALID_LIVE_HSA_SQL = `
  hsa_record.[hsa_id] IS NOT NULL
  AND LTRIM(RTRIM(hsa_record.[hsa_id])) = hsa_record.[hsa_id]
  AND LEN(hsa_record.[hsa_id]) <= 31
  AND hsa_record.[hsa_id] COLLATE Latin1_General_BIN2 LIKE N'[A-Z][A-Z][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-%'
  AND LEN(hsa_record.[hsa_id]) > 13
  AND PATINDEX(N'%[^A-Za-z0-9]%', SUBSTRING(hsa_record.[hsa_id], 14, 64) COLLATE Latin1_General_BIN2) = 0
`

const UP_STATEMENTS = [
  `IF EXISTS (
    SELECT 1
    FROM (
      SELECT [owner_hsa_id] AS [hsa_id] FROM [requirement_areas]
      UNION ALL
      SELECT [hsa_id] FROM [requirement_area_co_authors]
      UNION ALL
      SELECT [responsible_hsa_id] FROM [requirements_specifications] WHERE [responsible_hsa_id] IS NOT NULL
      UNION ALL
      SELECT [hsa_id] FROM [specification_co_authors]
      UNION ALL
      SELECT [lead_hsa_id] FROM [requirement_packages]
    ) hsa_record
    WHERE NOT (${VALID_LIVE_HSA_SQL})
  )
  THROW 51028, 'Cannot migrate live responsibility assignments: every live HSA-ID must match the current HSA-ID format and length.', 1;`,

  `CREATE TABLE [requirement_responsibility_people] (
    [hsa_id] nvarchar(31) NOT NULL,
    [given_name] nvarchar(max) NOT NULL,
    [middle_name] nvarchar(max) NULL,
    [surname] nvarchar(max) NULL,
    [email] nvarchar(450) NULL,
    [last_fetched_at] datetime2(3) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_requirement_responsibility_people] PRIMARY KEY ([hsa_id])
  );`,

  `INSERT INTO [requirement_responsibility_people] (
    [hsa_id],
    [given_name],
    [middle_name],
    [surname],
    [email],
    [last_fetched_at],
    [created_at],
    [updated_at]
  )
  SELECT
    hsa_record.[hsa_id],
    N'${PLACEHOLDER_GIVEN_NAME}',
    NULL,
    NULL,
    NULL,
    NULL,
    CAST(SYSUTCDATETIME() AS datetime2(3)),
    CAST(SYSUTCDATETIME() AS datetime2(3))
  FROM (
    SELECT [owner_hsa_id] AS [hsa_id] FROM [requirement_areas]
    UNION
    SELECT [hsa_id] FROM [requirement_area_co_authors]
    UNION
    SELECT [responsible_hsa_id] FROM [requirements_specifications] WHERE [responsible_hsa_id] IS NOT NULL
    UNION
    SELECT [hsa_id] FROM [specification_co_authors]
    UNION
    SELECT [lead_hsa_id] FROM [requirement_packages]
  ) hsa_record
  WHERE hsa_record.[hsa_id] IS NOT NULL;`,

  `DROP INDEX [idx_requirement_area_co_authors_hsa_id] ON [requirement_area_co_authors];`,
  `ALTER TABLE [requirement_area_co_authors] DROP CONSTRAINT [pk_requirement_area_co_authors];`,
  `ALTER TABLE [requirement_area_co_authors] ALTER COLUMN [hsa_id] nvarchar(31) NOT NULL;`,
  `ALTER TABLE [requirement_area_co_authors] DROP COLUMN [display_name];`,
  `ALTER TABLE [requirement_area_co_authors] ADD CONSTRAINT [pk_requirement_area_co_authors] PRIMARY KEY ([area_id], [hsa_id]);`,
  `CREATE INDEX [idx_requirement_area_co_authors_hsa_id] ON [requirement_area_co_authors] ([hsa_id]);`,

  `DROP INDEX [idx_specification_co_authors_hsa_id] ON [specification_co_authors];`,
  `ALTER TABLE [specification_co_authors] DROP CONSTRAINT [pk_specification_co_authors];`,
  `ALTER TABLE [specification_co_authors] ALTER COLUMN [hsa_id] nvarchar(31) NOT NULL;`,
  `ALTER TABLE [specification_co_authors] DROP COLUMN [display_name];`,
  `ALTER TABLE [specification_co_authors] ADD CONSTRAINT [pk_specification_co_authors] PRIMARY KEY ([specification_id], [hsa_id]);`,
  `CREATE INDEX [idx_specification_co_authors_hsa_id] ON [specification_co_authors] ([hsa_id]);`,

  `DROP INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications];`,
  `ALTER TABLE [requirements_specifications] ALTER COLUMN [responsible_hsa_id] nvarchar(31) NULL;`,
  `ALTER TABLE [requirements_specifications] DROP COLUMN [responsible_display_name];`,
  `CREATE INDEX [idx_requirements_specifications_responsible_hsa_id] ON [requirements_specifications] ([responsible_hsa_id]);`,

  `DROP INDEX [idx_requirement_packages_lead_hsa_id] ON [requirement_packages];`,
  `ALTER TABLE [requirement_packages] ALTER COLUMN [lead_hsa_id] nvarchar(31) NOT NULL;`,
  `ALTER TABLE [requirement_packages] DROP COLUMN [lead_display_name];`,
  `CREATE INDEX [idx_requirement_packages_lead_hsa_id] ON [requirement_packages] ([lead_hsa_id]);`,

  `ALTER TABLE [requirement_areas] ADD CONSTRAINT [fk_requirement_areas_owner_hsa_id] FOREIGN KEY ([owner_hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_area_co_authors] ADD CONSTRAINT [fk_requirement_area_co_authors_hsa_id] FOREIGN KEY ([hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirements_specifications] ADD CONSTRAINT [fk_requirements_specifications_responsible_hsa_id] FOREIGN KEY ([responsible_hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [specification_co_authors] ADD CONSTRAINT [fk_specification_co_authors_hsa_id] FOREIGN KEY ([hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_packages] ADD CONSTRAINT [fk_requirement_packages_lead_hsa_id] FOREIGN KEY ([lead_hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,

  `CREATE TABLE [requirement_package_co_authors] (
    [requirement_package_id] int NOT NULL,
    [hsa_id] nvarchar(31) NOT NULL,
    [created_at] datetime2(3) NOT NULL,
    [created_by_hsa_id] nvarchar(64) NULL,
    [created_by_display_name] nvarchar(max) NULL,
    CONSTRAINT [pk_requirement_package_co_authors] PRIMARY KEY ([requirement_package_id], [hsa_id])
  );`,
  `ALTER TABLE [requirement_package_co_authors] ADD CONSTRAINT [fk_requirement_package_co_authors_requirement_package_id] FOREIGN KEY ([requirement_package_id]) REFERENCES [requirement_packages] ([id])
    ON DELETE CASCADE
    ON UPDATE NO ACTION;`,
  `ALTER TABLE [requirement_package_co_authors] ADD CONSTRAINT [fk_requirement_package_co_authors_hsa_id] FOREIGN KEY ([hsa_id]) REFERENCES [requirement_responsibility_people] ([hsa_id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_requirement_package_co_authors_hsa_id] ON [requirement_package_co_authors] ([hsa_id]);`,
  `CREATE INDEX [idx_requirement_package_co_authors_created_by_hsa_id] ON [requirement_package_co_authors] ([created_by_hsa_id]);`,
]

const DOWN_STATEMENTS = [
  `THROW 51028, 'Cannot roll back requirement responsibility person migration: live display-name columns were removed and cannot be reconstructed without new HSA lookups.', 1;`,
]

export class RequirementResponsibilityPeople1717100000000 {
  name = 'RequirementResponsibilityPeople1717100000000'

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

export default RequirementResponsibilityPeople1717100000000
