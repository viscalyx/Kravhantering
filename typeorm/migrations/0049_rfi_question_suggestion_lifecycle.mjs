const LIFECYCLE_INVARIANT = `(
  (
    [is_review_requested] = 0
    AND [review_requested_at] IS NULL
    AND [resolution] IS NULL
    AND [resolution_motivation] IS NULL
    AND [resolved_by_hsa_id] IS NULL
    AND [resolved_by_display_name] IS NULL
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
        AND [resolved_by_hsa_id] IS NULL
        AND [resolved_by_display_name] IS NULL
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
  `IF EXISTS (
      SELECT 1
      FROM [rfi_question_suggestions]
      WHERE NOT ${LIFECYCLE_INVARIANT}
    )
    BEGIN
      DECLARE @invalid_ids nvarchar(1800);
      SELECT @invalid_ids = LEFT(
        STRING_AGG(CONVERT(nvarchar(max), [id]), N','),
        1800
      )
      FROM [rfi_question_suggestions]
      WHERE NOT ${LIFECYCLE_INVARIANT};

      DECLARE @diagnostic nvarchar(2048) =
        CONCAT(
          N'Cannot enforce RFI question suggestion lifecycle: incoherent row ids ',
          COALESCE(@invalid_ids, N'(unknown)'),
          N'. Review lifecycle timestamps and resolution evidence before retrying.'
        );
      THROW 51015, @diagnostic, 1;
    END;`,
  `IF EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE [name] = N'chk_rfi_question_suggestions_resolution'
        AND [parent_object_id] = OBJECT_ID(N'rfi_question_suggestions')
    )
    ALTER TABLE [rfi_question_suggestions]
      DROP CONSTRAINT [chk_rfi_question_suggestions_resolution];`,
  `ALTER TABLE [rfi_question_suggestions]
    WITH CHECK ADD CONSTRAINT [chk_rfi_question_suggestions_lifecycle]
    CHECK ${LIFECYCLE_INVARIANT};`,
  `CREATE OR ALTER TRIGGER [trg_rfi_question_suggestions_lifecycle]
    ON [rfi_question_suggestions]
    AFTER INSERT, UPDATE, DELETE
    AS
    BEGIN
      SET NOCOUNT ON;

      IF EXISTS (
        SELECT 1
        FROM inserted AS inserted_row
        LEFT JOIN deleted AS deleted_row
          ON deleted_row.[id] = inserted_row.[id]
        WHERE deleted_row.[id] IS NULL
          AND NOT (
            inserted_row.[is_review_requested] = 0
            AND inserted_row.[review_requested_at] IS NULL
            AND inserted_row.[resolution] IS NULL
          )
      )
        THROW 51016, 'RFI question suggestions must be created as drafts.', 1;

      IF EXISTS (
        SELECT 1
        FROM deleted AS deleted_row
        LEFT JOIN inserted AS inserted_row
          ON inserted_row.[id] = deleted_row.[id]
        WHERE inserted_row.[id] IS NULL
          AND NOT (
            deleted_row.[is_review_requested] = 0
            AND deleted_row.[review_requested_at] IS NULL
            AND deleted_row.[resolution] IS NULL
          )
      )
        THROW 51017, 'Only draft RFI question suggestions can be deleted.', 1;

      IF EXISTS (
        SELECT 1
        FROM inserted AS inserted_row
        INNER JOIN deleted AS deleted_row
          ON deleted_row.[id] = inserted_row.[id]
        CROSS APPLY (
          VALUES (
            CASE
              WHEN deleted_row.[is_review_requested] = 0 THEN N'draft'
              WHEN deleted_row.[resolution] IS NULL THEN N'review_requested'
              ELSE N'handled'
            END,
            CASE
              WHEN inserted_row.[is_review_requested] = 0 THEN N'draft'
              WHEN inserted_row.[resolution] IS NULL THEN N'review_requested'
              ELSE N'handled'
            END
          )
        ) AS lifecycle([from_state], [to_state])
        WHERE NOT (
          (
            lifecycle.[from_state] = N'draft'
            AND lifecycle.[to_state] = N'draft'
          )
          OR
          (
            lifecycle.[from_state] = N'draft'
            AND lifecycle.[to_state] = N'review_requested'
            AND NOT EXISTS (
              SELECT
                deleted_row.[area_id],
                deleted_row.[rfi_question_id],
                deleted_row.[source_specification_code],
                deleted_row.[source_specification_name],
                deleted_row.[content],
                deleted_row.[created_at]
              EXCEPT
              SELECT
                inserted_row.[area_id],
                inserted_row.[rfi_question_id],
                inserted_row.[source_specification_code],
                inserted_row.[source_specification_name],
                inserted_row.[content],
                inserted_row.[created_at]
            )
            AND (
              inserted_row.[specification_id] = deleted_row.[specification_id]
              OR (
                deleted_row.[specification_id] IS NOT NULL
                AND inserted_row.[specification_id] IS NULL
              )
              OR (
                deleted_row.[specification_id] IS NULL
                AND inserted_row.[specification_id] IS NULL
              )
            )
            AND (
              NOT EXISTS (
                SELECT
                  deleted_row.[created_by_hsa_id],
                  deleted_row.[created_by_display_name]
                EXCEPT
                SELECT
                  inserted_row.[created_by_hsa_id],
                  inserted_row.[created_by_display_name]
              )
              OR (
                deleted_row.[created_by_hsa_id] IS NOT NULL
                AND inserted_row.[created_by_hsa_id] IS NULL
              )
            )
          )
          OR
          (
            lifecycle.[from_state] = N'review_requested'
            AND lifecycle.[to_state] = N'review_requested'
            AND NOT EXISTS (
              SELECT
                deleted_row.[area_id],
                deleted_row.[rfi_question_id],
                deleted_row.[source_specification_code],
                deleted_row.[source_specification_name],
                deleted_row.[content],
                deleted_row.[created_at],
                deleted_row.[review_requested_at]
              EXCEPT
              SELECT
                inserted_row.[area_id],
                inserted_row.[rfi_question_id],
                inserted_row.[source_specification_code],
                inserted_row.[source_specification_name],
                inserted_row.[content],
                inserted_row.[created_at],
                inserted_row.[review_requested_at]
            )
            AND (
              inserted_row.[specification_id] = deleted_row.[specification_id]
              OR (
                deleted_row.[specification_id] IS NOT NULL
                AND inserted_row.[specification_id] IS NULL
              )
              OR (
                deleted_row.[specification_id] IS NULL
                AND inserted_row.[specification_id] IS NULL
              )
            )
            AND (
              NOT EXISTS (
                SELECT
                  deleted_row.[created_by_hsa_id],
                  deleted_row.[created_by_display_name]
                EXCEPT
                SELECT
                  inserted_row.[created_by_hsa_id],
                  inserted_row.[created_by_display_name]
              )
              OR (
                deleted_row.[created_by_hsa_id] IS NOT NULL
                AND inserted_row.[created_by_hsa_id] IS NULL
              )
            )
          )
          OR
          (
            lifecycle.[from_state] = N'review_requested'
            AND lifecycle.[to_state] = N'handled'
            AND NOT EXISTS (
              SELECT
                deleted_row.[area_id],
                deleted_row.[rfi_question_id],
                deleted_row.[source_specification_code],
                deleted_row.[source_specification_name],
                deleted_row.[content],
                deleted_row.[created_at],
                deleted_row.[review_requested_at]
              EXCEPT
              SELECT
                inserted_row.[area_id],
                inserted_row.[rfi_question_id],
                inserted_row.[source_specification_code],
                inserted_row.[source_specification_name],
                inserted_row.[content],
                inserted_row.[created_at],
                inserted_row.[review_requested_at]
            )
            AND (
              inserted_row.[specification_id] = deleted_row.[specification_id]
              OR (
                deleted_row.[specification_id] IS NOT NULL
                AND inserted_row.[specification_id] IS NULL
              )
              OR (
                deleted_row.[specification_id] IS NULL
                AND inserted_row.[specification_id] IS NULL
              )
            )
            AND (
              NOT EXISTS (
                SELECT
                  deleted_row.[created_by_hsa_id],
                  deleted_row.[created_by_display_name]
                EXCEPT
                SELECT
                  inserted_row.[created_by_hsa_id],
                  inserted_row.[created_by_display_name]
              )
              OR (
                deleted_row.[created_by_hsa_id] IS NOT NULL
                AND inserted_row.[created_by_hsa_id] IS NULL
              )
            )
          )
          OR
          (
            lifecycle.[from_state] = N'handled'
            AND lifecycle.[to_state] = N'handled'
            AND NOT EXISTS (
              SELECT
                deleted_row.[area_id],
                deleted_row.[rfi_question_id],
                deleted_row.[source_specification_code],
                deleted_row.[source_specification_name],
                deleted_row.[content],
                deleted_row.[created_at],
                deleted_row.[review_requested_at],
                deleted_row.[resolution],
                deleted_row.[resolution_motivation],
                deleted_row.[resolved_at]
              EXCEPT
              SELECT
                inserted_row.[area_id],
                inserted_row.[rfi_question_id],
                inserted_row.[source_specification_code],
                inserted_row.[source_specification_name],
                inserted_row.[content],
                inserted_row.[created_at],
                inserted_row.[review_requested_at],
                inserted_row.[resolution],
                inserted_row.[resolution_motivation],
                inserted_row.[resolved_at]
            )
            AND (
              inserted_row.[specification_id] = deleted_row.[specification_id]
              OR (
                deleted_row.[specification_id] IS NOT NULL
                AND inserted_row.[specification_id] IS NULL
              )
              OR (
                deleted_row.[specification_id] IS NULL
                AND inserted_row.[specification_id] IS NULL
              )
            )
            AND (
              NOT EXISTS (
                SELECT
                  deleted_row.[created_by_hsa_id],
                  deleted_row.[created_by_display_name]
                EXCEPT
                SELECT
                  inserted_row.[created_by_hsa_id],
                  inserted_row.[created_by_display_name]
              )
              OR (
                deleted_row.[created_by_hsa_id] IS NOT NULL
                AND inserted_row.[created_by_hsa_id] IS NULL
              )
            )
            AND (
              NOT EXISTS (
                SELECT
                  deleted_row.[resolved_by_hsa_id],
                  deleted_row.[resolved_by_display_name]
                EXCEPT
                SELECT
                  inserted_row.[resolved_by_hsa_id],
                  inserted_row.[resolved_by_display_name]
              )
              OR (
                deleted_row.[resolved_by_hsa_id] IS NOT NULL
                AND inserted_row.[resolved_by_hsa_id] IS NULL
              )
            )
          )
        )
      )
        THROW 51018, 'Invalid RFI question suggestion lifecycle transition or evidence mutation.', 1;
    END;`,
]

const DOWN_STATEMENTS = [
  `DROP TRIGGER IF EXISTS [trg_rfi_question_suggestions_lifecycle];`,
  `IF EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE [name] = N'chk_rfi_question_suggestions_lifecycle'
        AND [parent_object_id] = OBJECT_ID(N'rfi_question_suggestions')
    )
    ALTER TABLE [rfi_question_suggestions]
      DROP CONSTRAINT [chk_rfi_question_suggestions_lifecycle];`,
  `ALTER TABLE [rfi_question_suggestions]
    WITH CHECK ADD CONSTRAINT [chk_rfi_question_suggestions_resolution]
    CHECK ([resolution] IS NULL OR [resolution] IN (1, 2));`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class RfiQuestionSuggestionLifecycle1719600000000 {
  name = 'RfiQuestionSuggestionLifecycle1719600000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default RfiQuestionSuggestionLifecycle1719600000000
