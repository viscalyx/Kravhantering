const UP_STATEMENTS = [
  `ALTER TABLE [ai_run_coordination_entries] ADD
    [cancellation_requested_at] datetime2(3) NULL,
    [cancellation_reason] nvarchar(40) NULL;`,
  `ALTER TABLE [ai_run_coordination_entries] ADD
    CONSTRAINT [chk_ai_run_coordination_entries_cancellation]
    CHECK (([cancellation_requested_at] IS NULL AND [cancellation_reason] IS NULL)
      OR ([cancellation_requested_at] IS NOT NULL
        AND [cancellation_reason] IN (N'connection_suspended', N'connection_retired', N'profile_suspended')));`,
  `CREATE INDEX [idx_ai_run_coordination_entries_cancellation_requested_at]
    ON [ai_run_coordination_entries] ([cancellation_requested_at])
    WHERE [cancellation_requested_at] IS NOT NULL;`,
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
     THROW 51210, 'Runtime permission role is missing.', 1;
   GRANT UPDATE ([cancellation_requested_at], [cancellation_reason])
     ON OBJECT::[dbo].[ai_run_coordination_entries]
     TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `IF OBJECT_ID(N'ai_run_coordination_entries', N'U') IS NOT NULL BEGIN
     DROP INDEX IF EXISTS [idx_ai_run_coordination_entries_cancellation_requested_at]
       ON [ai_run_coordination_entries];
     ALTER TABLE [ai_run_coordination_entries]
       DROP CONSTRAINT [chk_ai_run_coordination_entries_cancellation];
     ALTER TABLE [ai_run_coordination_entries]
       DROP COLUMN [cancellation_requested_at], [cancellation_reason];
   END;`,
]

export class AiRunAdministrativeCancellation1720800000003 {
  name = 'AiRunAdministrativeCancellation1720800000003'

  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }

  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}

export default AiRunAdministrativeCancellation1720800000003
