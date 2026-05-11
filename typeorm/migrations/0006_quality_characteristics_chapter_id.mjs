const UP_STATEMENTS = [
  'ALTER TABLE [quality_characteristics] ADD [chapter_id] nvarchar(32) NULL;',
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1' WHERE [id] = 1;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1.1' WHERE [id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1.2' WHERE [id] = 3;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1.3' WHERE [id] = 4;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2' WHERE [id] = 5;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2.1' WHERE [id] = 6;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2.2' WHERE [id] = 7;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2.3' WHERE [id] = 8;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.3' WHERE [id] = 9;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.3.1' WHERE [id] = 10;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.3.2' WHERE [id] = 11;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4' WHERE [id] = 12;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.1' WHERE [id] = 13;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.2' WHERE [id] = 14;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.3' WHERE [id] = 15;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.4' WHERE [id] = 16;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.5' WHERE [id] = 17;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.6' WHERE [id] = 18;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.7' WHERE [id] = 19;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.8' WHERE [id] = 20;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5' WHERE [id] = 21;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.1' WHERE [id] = 22;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.2' WHERE [id] = 23;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.3' WHERE [id] = 24;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.4' WHERE [id] = 25;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6' WHERE [id] = 26;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.1' WHERE [id] = 27;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.2' WHERE [id] = 28;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.3' WHERE [id] = 29;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.4' WHERE [id] = 30;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.5' WHERE [id] = 31;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.6' WHERE [id] = 32;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7' WHERE [id] = 33;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.1' WHERE [id] = 34;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.2' WHERE [id] = 35;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.3' WHERE [id] = 36;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.4' WHERE [id] = 37;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.5' WHERE [id] = 38;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8' WHERE [id] = 39;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.1' WHERE [id] = 40;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.2' WHERE [id] = 41;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.3' WHERE [id] = 42;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.4' WHERE [id] = 43;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9' WHERE [id] = 44;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.1' WHERE [id] = 45;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.2' WHERE [id] = 46;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.3' WHERE [id] = 47;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.4' WHERE [id] = 48;",
  'ALTER TABLE [quality_characteristics] ALTER COLUMN [chapter_id] nvarchar(32) NOT NULL;',
]

const DOWN_STATEMENTS = [
  'ALTER TABLE [quality_characteristics] DROP COLUMN [chapter_id];',
]

export class QualityCharacteristicsChapterId1715200000000 {
  name = 'QualityCharacteristicsChapterId1715200000000'

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

export default QualityCharacteristicsChapterId1715200000000
