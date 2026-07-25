const LIFECYCLE_INVARIANT = `(
  (
    [is_review_requested] = 0
    AND [review_requested_at] IS NULL
    AND [resolution] IS NULL
    AND [resolution_motivation] IS NULL
    AND [resolved_by] IS NULL
    AND [resolved_by_hsa_id] IS NULL
    AND [resolved_at] IS NULL
  )
  OR
  (
    [is_review_requested] = 1
    AND [review_requested_at] IS NOT NULL
    AND [review_requested_at] >= [created_at]
    AND
    (
      (
        [resolution] IS NULL
        AND [resolution_motivation] IS NULL
        AND [resolved_by] IS NULL
        AND [resolved_by_hsa_id] IS NULL
        AND [resolved_at] IS NULL
      )
      OR
      (
        [resolution] IN (1, 2)
        AND NULLIF(LTRIM(RTRIM([resolution_motivation])), N'') IS NOT NULL
        AND [resolved_at] IS NOT NULL
        AND [resolved_at] >= [review_requested_at]
      )
    )
  )
)`

const UP_STATEMENTS = [
  `UPDATE [improvement_suggestions]
    SET [resolution] = NULL,
        [resolution_motivation] = NULL,
        [resolved_by] = NULL,
        [resolved_by_hsa_id] = NULL,
        [resolved_at] = NULL
    WHERE [is_review_requested] = 1
      AND [review_requested_at] IS NOT NULL
      AND [review_requested_at] >= [created_at]
      AND NOT (
        (
          [resolution] IS NULL
          AND [resolution_motivation] IS NULL
          AND [resolved_by] IS NULL
          AND [resolved_by_hsa_id] IS NULL
          AND [resolved_at] IS NULL
        )
        OR
        (
          [resolution] IN (1, 2)
          AND NULLIF(LTRIM(RTRIM([resolution_motivation])), N'') IS NOT NULL
          AND [resolved_at] IS NOT NULL
          AND [resolved_at] >= [review_requested_at]
        )
      );`,
  `UPDATE [improvement_suggestions]
    SET [is_review_requested] = 0,
        [review_requested_at] = NULL,
        [resolution] = NULL,
        [resolution_motivation] = NULL,
        [resolved_by] = NULL,
        [resolved_by_hsa_id] = NULL,
        [resolved_at] = NULL
    WHERE [is_review_requested] <> 1
       OR [review_requested_at] IS NULL
       OR [review_requested_at] < [created_at];`,
  `ALTER TABLE [improvement_suggestions]
    WITH CHECK ADD CONSTRAINT [chk_improvement_suggestions_lifecycle]
    CHECK ${LIFECYCLE_INVARIANT};`,
]

const DOWN_STATEMENTS = [
  `IF EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE [name] = N'chk_improvement_suggestions_lifecycle'
        AND [parent_object_id] = OBJECT_ID(N'improvement_suggestions')
    )
    ALTER TABLE [improvement_suggestions]
      DROP CONSTRAINT [chk_improvement_suggestions_lifecycle];`,
]

export class ImprovementSuggestionLifecycle1719900000000 {
  name = 'ImprovementSuggestionLifecycle1719900000000'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) {
      await queryRunner.query(statement)
    }
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) {
      await queryRunner.query(statement)
    }
  }
}

export default ImprovementSuggestionLifecycle1719900000000
