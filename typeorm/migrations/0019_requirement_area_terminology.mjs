const UP_STATEMENTS = [
  "UPDATE [ui_terminology] SET [singular_sv] = CASE WHEN [singular_sv] = N'Område' THEN N'Kravområde' ELSE [singular_sv] END, [plural_sv] = CASE WHEN [plural_sv] = N'Områden' THEN N'Kravområden' ELSE [plural_sv] END, [definite_plural_sv] = CASE WHEN [definite_plural_sv] = N'Områdena' THEN N'Kravområdena' ELSE [definite_plural_sv] END, [singular_en] = CASE WHEN [singular_en] = N'Area' THEN N'Requirement area' ELSE [singular_en] END, [plural_en] = CASE WHEN [plural_en] = N'Areas' THEN N'Requirement areas' ELSE [plural_en] END, [definite_plural_en] = CASE WHEN [definite_plural_en] = N'Areas' THEN N'Requirement areas' ELSE [definite_plural_en] END, [updated_at] = SYSUTCDATETIME() WHERE [key] = N'area';",
]

const DOWN_STATEMENTS = [
  "UPDATE [ui_terminology] SET [singular_sv] = CASE WHEN [singular_sv] = N'Kravområde' THEN N'Område' ELSE [singular_sv] END, [plural_sv] = CASE WHEN [plural_sv] = N'Kravområden' THEN N'Områden' ELSE [plural_sv] END, [definite_plural_sv] = CASE WHEN [definite_plural_sv] = N'Kravområdena' THEN N'Områdena' ELSE [definite_plural_sv] END, [singular_en] = CASE WHEN [singular_en] = N'Requirement area' THEN N'Area' ELSE [singular_en] END, [plural_en] = CASE WHEN [plural_en] = N'Requirement areas' THEN N'Areas' ELSE [plural_en] END, [definite_plural_en] = CASE WHEN [definite_plural_en] = N'Requirement areas' THEN N'Areas' ELSE [definite_plural_en] END, [updated_at] = SYSUTCDATETIME() WHERE [key] = N'area';",
]

export class RequirementAreaTerminology1716200000000 {
  name = 'RequirementAreaTerminology1716200000000'
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
export default RequirementAreaTerminology1716200000000
