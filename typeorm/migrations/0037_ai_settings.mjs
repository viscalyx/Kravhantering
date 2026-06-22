const UP_STATEMENTS = [
  `CREATE TABLE [ai_settings] (
      [id] int IDENTITY(1,1) NOT NULL,
      [requirement_generation_enabled] bit NOT NULL CONSTRAINT [df_ai_settings_requirement_generation_enabled] DEFAULT (1),
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_ai_settings] PRIMARY KEY ([id]),
      CONSTRAINT [chk_ai_settings_id] CHECK ([id] = 1)
    );`,
  `SET IDENTITY_INSERT [ai_settings] ON;

    INSERT INTO [ai_settings] (
      [id],
      [requirement_generation_enabled],
      [created_at],
      [updated_at]
    )
    VALUES (
      1,
      1,
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    );

    SET IDENTITY_INSERT [ai_settings] OFF;`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_settings', N'U') IS NOT NULL
    DROP TABLE [ai_settings];`,
]

export class AiSettings1718400000000 {
  name = 'AiSettings1718400000000'

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

export default AiSettings1718400000000
