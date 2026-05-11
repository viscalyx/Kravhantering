const UP_STATEMENTS = [
  'ALTER TABLE [quality_characteristics] ADD [chapter_id] nvarchar(32) NULL;',
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1' WHERE [name_sv] = N'Funktionell lämplighet' AND [requirement_type_id] = 1;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1.1' WHERE [name_sv] = N'Funktionell fullständighet' AND [requirement_type_id] = 1;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1.2' WHERE [name_sv] = N'Funktionell korrekthet' AND [requirement_type_id] = 1;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.1.3' WHERE [name_sv] = N'Funktionell ändamålsenlighet' AND [requirement_type_id] = 1;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2' WHERE [name_sv] = N'Prestandaeffektivitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2.1' WHERE [name_sv] = N'Tidsbeteende' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2.2' WHERE [name_sv] = N'Resursutnyttjande' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.2.3' WHERE [name_sv] = N'Kapacitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.3' WHERE [name_sv] = N'Kompatibilitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.3.1' WHERE [name_sv] = N'Samexistens' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.3.2' WHERE [name_sv] = N'Interoperabilitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4' WHERE [name_sv] = N'Interaktionsförmåga' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.1' WHERE [name_sv] = N'Igenkännbar ändamålsenlighet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.2' WHERE [name_sv] = N'Lärbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.3' WHERE [name_sv] = N'Användbar driftbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.4' WHERE [name_sv] = N'Skydd mot användarfel' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.5' WHERE [name_sv] = N'Användarengagemang' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.6' WHERE [name_sv] = N'Inkluderande användning' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.7' WHERE [name_sv] = N'Användarstöd' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.4.8' WHERE [name_sv] = N'Självbeskrivande förmåga' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5' WHERE [name_sv] = N'Tillförlitlighet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.1' WHERE [name_sv] = N'Felfrihet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.2' WHERE [name_sv] = N'Tillgänglighet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.3' WHERE [name_sv] = N'Feltolerans' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.5.4' WHERE [name_sv] = N'Återställbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6' WHERE [name_sv] = N'Informationssäkerhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.1' WHERE [name_sv] = N'Konfidentialitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.2' WHERE [name_sv] = N'Integritet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.3' WHERE [name_sv] = N'Oavvislighet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.4' WHERE [name_sv] = N'Ansvarsskyldighet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.5' WHERE [name_sv] = N'Autenticitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.6.6' WHERE [name_sv] = N'Motståndskraft' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7' WHERE [name_sv] = N'Underhållbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.1' WHERE [name_sv] = N'Modularitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.2' WHERE [name_sv] = N'Återanvändbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.3' WHERE [name_sv] = N'Analyserbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.4' WHERE [name_sv] = N'Ändringsbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.7.5' WHERE [name_sv] = N'Testbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8' WHERE [name_sv] = N'Flexibilitet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.1' WHERE [name_sv] = N'Anpassningsbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.2' WHERE [name_sv] = N'Skalbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.3' WHERE [name_sv] = N'Installerbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.8.4' WHERE [name_sv] = N'Utbytbarhet' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9' WHERE [name_sv] = N'Säkerhet mot skada' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.1' WHERE [name_sv] = N'Driftsbegränsning' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.2' WHERE [name_sv] = N'Riskidentifiering' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.3' WHERE [name_sv] = N'Felsäkert beteende' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.4' WHERE [name_sv] = N'Farovarning' AND [requirement_type_id] = 2;",
  "UPDATE [quality_characteristics] SET [chapter_id] = N'3.9.5' WHERE [name_sv] = N'Säker integration' AND [requirement_type_id] = 2;",
  "IF EXISTS (SELECT 1 FROM [quality_characteristics] WHERE [chapter_id] IS NULL) THROW 51001, N'Failed to backfill quality_characteristics.chapter_id for one or more existing rows.', 1;",
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
