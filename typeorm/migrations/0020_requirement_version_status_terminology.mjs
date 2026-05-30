const UP_STATEMENTS = [
  "UPDATE [ui_terminology] SET [singular_sv] = CASE WHEN [singular_sv] = N'Status' THEN N'Kravversionsstatus' ELSE [singular_sv] END, [plural_sv] = CASE WHEN [plural_sv] = N'Statusar' THEN N'Kravversionsstatusar' ELSE [plural_sv] END, [definite_plural_sv] = CASE WHEN [definite_plural_sv] = N'Statusarna' THEN N'Kravversionsstatusarna' ELSE [definite_plural_sv] END, [singular_en] = CASE WHEN [singular_en] = N'Status' THEN N'Requirement version status' ELSE [singular_en] END, [plural_en] = CASE WHEN [plural_en] = N'Statuses' THEN N'Requirement version statuses' ELSE [plural_en] END, [definite_plural_en] = CASE WHEN [definite_plural_en] = N'Statuses' THEN N'Requirement version statuses' ELSE [definite_plural_en] END, [updated_at] = SYSUTCDATETIME() WHERE [key] = N'status';",
]

const DOWN_STATEMENTS = [
  "UPDATE [ui_terminology] SET [singular_sv] = CASE WHEN [singular_sv] = N'Kravversionsstatus' THEN N'Status' ELSE [singular_sv] END, [plural_sv] = CASE WHEN [plural_sv] = N'Kravversionsstatusar' THEN N'Statusar' ELSE [plural_sv] END, [definite_plural_sv] = CASE WHEN [definite_plural_sv] = N'Kravversionsstatusarna' THEN N'Statusarna' ELSE [definite_plural_sv] END, [singular_en] = CASE WHEN [singular_en] = N'Requirement version status' THEN N'Status' ELSE [singular_en] END, [plural_en] = CASE WHEN [plural_en] = N'Requirement version statuses' THEN N'Statuses' ELSE [plural_en] END, [definite_plural_en] = CASE WHEN [definite_plural_en] = N'Requirement version statuses' THEN N'Statuses' ELSE [definite_plural_en] END, [updated_at] = SYSUTCDATETIME() WHERE [key] = N'status';",
]

export class RequirementVersionStatusTerminology1716300000000 {
  name = 'RequirementVersionStatusTerminology1716300000000'
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
export default RequirementVersionStatusTerminology1716300000000
