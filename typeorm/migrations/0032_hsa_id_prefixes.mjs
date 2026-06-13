const ACTIVE_HSA_PREFIX_COUNTS_SQL = `
  SELECT
    LEFT(hsa_record.[hsa_id], 12) AS [prefix],
    COUNT(*) AS [usage_count]
  FROM (
    SELECT [owner_hsa_id] AS [hsa_id]
    FROM [requirement_areas]
    WHERE [owner_hsa_id] IS NOT NULL
    UNION ALL
    SELECT [hsa_id]
    FROM [requirement_area_co_authors]
    WHERE [hsa_id] IS NOT NULL
    UNION ALL
    SELECT [responsible_hsa_id]
    FROM [requirements_specifications]
    WHERE [responsible_hsa_id] IS NOT NULL
    UNION ALL
    SELECT [hsa_id]
    FROM [specification_co_authors]
    WHERE [hsa_id] IS NOT NULL
    UNION ALL
    SELECT [lead_hsa_id]
    FROM [requirement_packages]
    WHERE [lead_hsa_id] IS NOT NULL
    UNION ALL
    SELECT [hsa_id]
    FROM [requirement_package_co_authors]
    WHERE [hsa_id] IS NOT NULL
  ) hsa_record
  WHERE hsa_record.[hsa_id] COLLATE Latin1_General_BIN2 LIKE N'[A-Z][A-Z][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-%'
    AND LEN(hsa_record.[hsa_id]) > 13
    AND PATINDEX(N'%[^A-Za-z0-9]%', SUBSTRING(hsa_record.[hsa_id], 14, 64) COLLATE Latin1_General_BIN2) = 0
  GROUP BY LEFT(hsa_record.[hsa_id], 12)
`

const UP_STATEMENTS = [
  `CREATE TABLE [hsa_id_prefixes] (
    [id] int IDENTITY(1,1) NOT NULL,
    [prefix] nvarchar(12) NOT NULL,
    [label] nvarchar(450) NULL,
    [is_visible] bit NOT NULL DEFAULT (1),
    [is_default] bit NOT NULL DEFAULT (0),
    [created_at] datetime2(3) NOT NULL,
    [updated_at] datetime2(3) NOT NULL,
    CONSTRAINT [pk_hsa_id_prefixes] PRIMARY KEY ([id]),
    CONSTRAINT [chk_hsa_id_prefixes_prefix] CHECK (
      [prefix] COLLATE Latin1_General_BIN2 LIKE N'[A-Z][A-Z][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
      AND LEN([prefix]) = 12
    ),
    CONSTRAINT [chk_hsa_id_prefixes_default_visible] CHECK (
      [is_default] = 0 OR [is_visible] = 1
    )
  );`,
  `CREATE UNIQUE INDEX [uq_hsa_id_prefixes_prefix] ON [hsa_id_prefixes] ([prefix]);`,
  `CREATE UNIQUE INDEX [uq_hsa_id_prefixes_default] ON [hsa_id_prefixes] ([is_default]) WHERE [is_default] = 1;`,
  `CREATE INDEX [idx_hsa_id_prefixes_is_visible] ON [hsa_id_prefixes] ([is_visible]);`,
  `WITH prefix_counts AS (
    ${ACTIVE_HSA_PREFIX_COUNTS_SQL}
  ),
  default_prefix AS (
    SELECT TOP (1) [prefix]
    FROM prefix_counts
    ORDER BY [usage_count] DESC, [prefix] ASC
  )
  INSERT INTO [hsa_id_prefixes] (
    [prefix],
    [label],
    [is_visible],
    [is_default],
    [created_at],
    [updated_at]
  )
  SELECT
    prefix_counts.[prefix],
    NULL,
    1,
    CASE WHEN prefix_counts.[prefix] = default_prefix.[prefix] THEN 1 ELSE 0 END,
    CAST(SYSUTCDATETIME() AS datetime2(3)),
    CAST(SYSUTCDATETIME() AS datetime2(3))
  FROM prefix_counts
  CROSS JOIN default_prefix;`,
]

const DOWN_STATEMENTS = [
  `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_hsa_id_prefixes_is_visible' AND object_id = OBJECT_ID(N'hsa_id_prefixes'))
    DROP INDEX [idx_hsa_id_prefixes_is_visible] ON [hsa_id_prefixes];`,
  `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_hsa_id_prefixes_default' AND object_id = OBJECT_ID(N'hsa_id_prefixes'))
    DROP INDEX [uq_hsa_id_prefixes_default] ON [hsa_id_prefixes];`,
  `IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'uq_hsa_id_prefixes_prefix' AND object_id = OBJECT_ID(N'hsa_id_prefixes'))
    DROP INDEX [uq_hsa_id_prefixes_prefix] ON [hsa_id_prefixes];`,
  `IF OBJECT_ID(N'hsa_id_prefixes', N'U') IS NOT NULL DROP TABLE [hsa_id_prefixes];`,
]

export class HsaIdPrefixes1717500000000 {
  name = 'HsaIdPrefixes1717500000000'

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

export default HsaIdPrefixes1717500000000
