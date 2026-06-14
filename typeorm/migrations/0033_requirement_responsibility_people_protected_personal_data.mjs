const UP_STATEMENTS = [
  `ALTER TABLE [requirement_responsibility_people] ADD [has_protected_personal_data] bit NOT NULL
      CONSTRAINT [df_requirement_responsibility_people_has_protected_personal_data]
      DEFAULT (0);`,
]

const DOWN_STATEMENTS = [
  `ALTER TABLE [requirement_responsibility_people]
    DROP CONSTRAINT [df_requirement_responsibility_people_has_protected_personal_data];`,
  `ALTER TABLE [requirement_responsibility_people]
    DROP COLUMN [has_protected_personal_data];`,
]

export class RequirementResponsibilityPeopleProtectedPersonalData1718000000000 {
  name = 'RequirementResponsibilityPeopleProtectedPersonalData1718000000000'

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
