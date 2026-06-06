const VALID_OWNER_HSA_SQL = `
  owner_record.[hsa_id] IS NOT NULL
  AND LTRIM(RTRIM(owner_record.[hsa_id])) = owner_record.[hsa_id]
  AND LEN(owner_record.[hsa_id]) <= 31
  AND owner_record.[hsa_id] COLLATE Latin1_General_BIN2 LIKE N'[A-Z][A-Z][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-%'
  AND LEN(owner_record.[hsa_id]) > 13
  AND PATINDEX(N'%[^A-Za-z0-9]%', SUBSTRING(owner_record.[hsa_id], 14, 64) COLLATE Latin1_General_BIN2) = 0
`

const UP_STATEMENTS = [
  `IF EXISTS (
    SELECT 1
    FROM [requirement_areas] area
    LEFT JOIN [owners] owner_record ON owner_record.[id] = area.[owner_id]
    WHERE NOT (${VALID_OWNER_HSA_SQL})
  )
  THROW 51026, 'Cannot migrate requirement_areas: every area must have an owner with a valid HSA-ID.', 1;`,

  `ALTER TABLE [requirement_areas] ADD [owner_hsa_id] nvarchar(31) NULL;`,

  `UPDATE area
  SET [owner_hsa_id] = owner_record.[hsa_id]
  FROM [requirement_areas] area
  INNER JOIN [owners] owner_record ON owner_record.[id] = area.[owner_id];`,

  `IF EXISTS (SELECT 1 FROM [requirement_areas] WHERE [owner_hsa_id] IS NULL)
  THROW 51026, 'Cannot migrate requirement_areas: owner_hsa_id backfill left null values.', 1;`,

  `ALTER TABLE [requirement_areas] ALTER COLUMN [owner_hsa_id] nvarchar(31) NOT NULL;`,
  `CREATE INDEX [idx_requirement_areas_owner_hsa_id] ON [requirement_areas] ([owner_hsa_id]);`,
  `ALTER TABLE [requirement_areas] DROP CONSTRAINT [fk_requirement_areas_owner_id];`,
  `ALTER TABLE [requirement_areas] DROP COLUMN [owner_id];`,
  `DROP TABLE [owners];`,
]

const DOWN_STATEMENTS = [
  `CREATE TABLE [owners] (
    [id] int IDENTITY(1,1) NOT NULL,
    [first_name] nvarchar(max) NOT NULL,
    [last_name] nvarchar(max) NOT NULL,
    [email] nvarchar(450) NULL,
    [hsa_id] nvarchar(64) NULL,
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_owners] PRIMARY KEY ([id])
  );`,
  `CREATE UNIQUE INDEX [uq_owners_email] ON [owners] ([email]) WHERE [email] IS NOT NULL;`,
  `CREATE UNIQUE INDEX [uq_owners_hsa_id] ON [owners] ([hsa_id]) WHERE [hsa_id] IS NOT NULL;`,
  `INSERT INTO [owners] ([first_name], [last_name], [email], [hsa_id], [created_at], [updated_at])
  SELECT DISTINCT
    area.[owner_hsa_id],
    N'',
    NULL,
    area.[owner_hsa_id],
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  FROM [requirement_areas] area;`,
  `ALTER TABLE [requirement_areas] ADD [owner_id] int NULL;`,
  `UPDATE area
  SET [owner_id] = owner_record.[id]
  FROM [requirement_areas] area
  INNER JOIN [owners] owner_record ON owner_record.[hsa_id] = area.[owner_hsa_id];`,
  `ALTER TABLE [requirement_areas]
    ADD CONSTRAINT [fk_requirement_areas_owner_id]
    FOREIGN KEY ([owner_id]) REFERENCES [owners] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `DROP INDEX [idx_requirement_areas_owner_hsa_id] ON [requirement_areas];`,
  `ALTER TABLE [requirement_areas] DROP COLUMN [owner_hsa_id];`,
]

export class RequirementAreaOwnerHsaId1716900000000 {
  name = 'RequirementAreaOwnerHsaId1716900000000'

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

export default RequirementAreaOwnerHsaId1716900000000
