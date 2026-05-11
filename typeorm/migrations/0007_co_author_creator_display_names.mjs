const UP_STATEMENTS = [
  'ALTER TABLE [requirement_area_co_authors] ADD [created_by_display_name] nvarchar(max) NULL;',
  'ALTER TABLE [specification_co_authors] ADD [created_by_display_name] nvarchar(max) NULL;',
  `UPDATE [requirement_area_co_authors]
    SET [created_by_display_name] = CASE [created_by_hsa_id]
      WHEN N'SE2321000032-seed' THEN N'seed'
      WHEN N'SE2321000032-seeddogfood' THEN N'seed-dogfood'
      WHEN N'SE2321000032-annaj' THEN N'Anna Johansson'
      WHEN N'SE2321000032-erikl' THEN N'Erik Lindberg'
      WHEN N'SE2321000032-marias' THEN N'Maria Svensson'
      WHEN N'SE2321000032-saraholm' THEN N'Sara Holm'
      WHEN N'SE2321000032-karlpersson' THEN N'Karl Persson'
      WHEN N'SE2321000032-linneab' THEN N'Linnéa Bergström'
      WHEN N'SE2321000032-oscarn' THEN N'Oscar Nilsson'
      WHEN N'SE2321000032-emmal' THEN N'Emma Lindqvist'
      WHEN N'SE2321000032-kalle1' THEN N'Kalle Svensson'
      WHEN N'SE2321000032-kalle2' THEN N'Kalle Svensson'
      ELSE [created_by_display_name]
    END
    WHERE [created_by_hsa_id] IS NOT NULL
      AND [created_by_display_name] IS NULL;`,
  `UPDATE [specification_co_authors]
    SET [created_by_display_name] = CASE [created_by_hsa_id]
      WHEN N'SE2321000032-seed' THEN N'seed'
      WHEN N'SE2321000032-seeddogfood' THEN N'seed-dogfood'
      WHEN N'SE2321000032-annaj' THEN N'Anna Johansson'
      WHEN N'SE2321000032-erikl' THEN N'Erik Lindberg'
      WHEN N'SE2321000032-marias' THEN N'Maria Svensson'
      WHEN N'SE2321000032-saraholm' THEN N'Sara Holm'
      WHEN N'SE2321000032-karlpersson' THEN N'Karl Persson'
      WHEN N'SE2321000032-linneab' THEN N'Linnéa Bergström'
      WHEN N'SE2321000032-oscarn' THEN N'Oscar Nilsson'
      WHEN N'SE2321000032-emmal' THEN N'Emma Lindqvist'
      WHEN N'SE2321000032-kalle1' THEN N'Kalle Svensson'
      WHEN N'SE2321000032-kalle2' THEN N'Kalle Svensson'
      ELSE [created_by_display_name]
    END
    WHERE [created_by_hsa_id] IS NOT NULL
      AND [created_by_display_name] IS NULL;`,
]

const DOWN_STATEMENTS = [
  'ALTER TABLE [specification_co_authors] DROP COLUMN [created_by_display_name];',
  'ALTER TABLE [requirement_area_co_authors] DROP COLUMN [created_by_display_name];',
]

export class CoAuthorCreatorDisplayNames1715300000000 {
  name = 'CoAuthorCreatorDisplayNames1715300000000'

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

export default CoAuthorCreatorDisplayNames1715300000000
