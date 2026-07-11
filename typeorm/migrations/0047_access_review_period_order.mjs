const UP_STATEMENTS = [
  `IF OBJECT_ID(N'access_review_runs', N'U') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_access_review_runs_period_order'
        AND parent_object_id = OBJECT_ID(N'access_review_runs')
    )
    ALTER TABLE [access_review_runs]
    WITH CHECK ADD CONSTRAINT [chk_access_review_runs_period_order]
    CHECK ([period_start] <= [period_end]);`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'access_review_runs', N'U') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = N'chk_access_review_runs_period_order'
        AND parent_object_id = OBJECT_ID(N'access_review_runs')
    )
    ALTER TABLE [access_review_runs]
    DROP CONSTRAINT [chk_access_review_runs_period_order];`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class AccessReviewPeriodOrder1719400000000 {
  name = 'AccessReviewPeriodOrder1719400000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default AccessReviewPeriodOrder1719400000000
