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
  `THROW 51026, 'Cannot roll back requirement_area owner_hsa_id migration: owners rows were removed and the original names, email addresses and timestamps cannot be reconstructed without data loss.', 1;`,
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
