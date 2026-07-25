const ACTION_AUDIT_INDEXES_WITH_ID = [
  ['idx_action_audit_events_occurred_at', '[occurred_at] DESC, [id] DESC'],
  [
    'idx_action_audit_events_actor_hsa_id_occurred_at',
    '[actor_hsa_id], [occurred_at] DESC, [id] DESC',
  ],
  [
    'idx_action_audit_events_target_occurred_at',
    '[target_kind], [target_id], [occurred_at] DESC, [id] DESC',
  ],
  [
    'idx_action_audit_events_action_occurred_at',
    '[action], [occurred_at] DESC, [id] DESC',
  ],
  [
    'idx_action_audit_events_client_ip_occurred_at',
    '[client_ip], [occurred_at] DESC, [id] DESC',
  ],
]

const ACTION_AUDIT_INDEXES_WITHOUT_ID = [
  ['idx_action_audit_events_occurred_at', '[occurred_at] DESC'],
  [
    'idx_action_audit_events_actor_hsa_id_occurred_at',
    '[actor_hsa_id], [occurred_at] DESC',
  ],
  [
    'idx_action_audit_events_target_occurred_at',
    '[target_kind], [target_id], [occurred_at] DESC',
  ],
  [
    'idx_action_audit_events_action_occurred_at',
    '[action], [occurred_at] DESC',
  ],
  [
    'idx_action_audit_events_client_ip_occurred_at',
    '[client_ip], [occurred_at] DESC',
  ],
]

function recreateActionAuditIndexes(indexes) {
  return indexes.map(
    ([name, columns]) => `IF EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE [name] = N'${name}'
        AND [object_id] = OBJECT_ID(N'action_audit_events')
    )
      DROP INDEX [${name}] ON [action_audit_events];
    CREATE INDEX [${name}]
      ON [action_audit_events] (${columns});`,
  )
}

const UP_STATEMENTS = [
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_requirements') IS NOT NULL
    AND COL_LENGTH(N'application_settings', N'csv_export_max_items') IS NULL
    BEGIN
      IF OBJECT_ID(
        N'df_application_settings_csv_export_max_requirements',
        N'D'
      ) IS NOT NULL
        ALTER TABLE [application_settings]
          DROP CONSTRAINT [df_application_settings_csv_export_max_requirements];
      IF OBJECT_ID(
        N'chk_application_settings_csv_export_max_requirements',
        N'C'
      ) IS NOT NULL
        ALTER TABLE [application_settings]
          DROP CONSTRAINT [chk_application_settings_csv_export_max_requirements];
    END;`,
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_requirements') IS NOT NULL
    AND COL_LENGTH(N'application_settings', N'csv_export_max_items') IS NULL
      EXEC sp_rename
        N'dbo.application_settings.csv_export_max_requirements',
        N'csv_export_max_items',
        N'COLUMN';`,
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_items') IS NOT NULL
    AND OBJECT_ID(
      N'df_application_settings_csv_export_max_items',
      N'D'
    ) IS NULL
      ALTER TABLE [application_settings]
        ADD CONSTRAINT [df_application_settings_csv_export_max_items]
        DEFAULT (1000) FOR [csv_export_max_items];`,
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_items') IS NOT NULL
    AND OBJECT_ID(
      N'chk_application_settings_csv_export_max_items',
      N'C'
    ) IS NULL
      ALTER TABLE [application_settings]
        WITH CHECK ADD CONSTRAINT [chk_application_settings_csv_export_max_items]
        CHECK (
          [csv_export_max_items] >= 1
          AND [csv_export_max_items] <= 5000
        );`,
  ...recreateActionAuditIndexes(ACTION_AUDIT_INDEXES_WITH_ID),
]

const DOWN_STATEMENTS = [
  ...recreateActionAuditIndexes(ACTION_AUDIT_INDEXES_WITHOUT_ID),
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_items') IS NOT NULL
    AND COL_LENGTH(N'application_settings', N'csv_export_max_requirements') IS NULL
    BEGIN
      IF OBJECT_ID(
        N'df_application_settings_csv_export_max_items',
        N'D'
      ) IS NOT NULL
        ALTER TABLE [application_settings]
          DROP CONSTRAINT [df_application_settings_csv_export_max_items];
      IF OBJECT_ID(
        N'chk_application_settings_csv_export_max_items',
        N'C'
      ) IS NOT NULL
        ALTER TABLE [application_settings]
          DROP CONSTRAINT [chk_application_settings_csv_export_max_items];
    END;`,
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_items') IS NOT NULL
    AND COL_LENGTH(N'application_settings', N'csv_export_max_requirements') IS NULL
      EXEC sp_rename
        N'dbo.application_settings.csv_export_max_items',
        N'csv_export_max_requirements',
        N'COLUMN';`,
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_requirements') IS NOT NULL
    AND OBJECT_ID(
      N'df_application_settings_csv_export_max_requirements',
      N'D'
    ) IS NULL
      ALTER TABLE [application_settings]
        ADD CONSTRAINT [df_application_settings_csv_export_max_requirements]
        DEFAULT (1000) FOR [csv_export_max_requirements];`,
  `IF COL_LENGTH(N'application_settings', N'csv_export_max_requirements') IS NOT NULL
    AND OBJECT_ID(
      N'chk_application_settings_csv_export_max_requirements',
      N'C'
    ) IS NULL
      ALTER TABLE [application_settings]
        WITH CHECK ADD CONSTRAINT [chk_application_settings_csv_export_max_requirements]
        CHECK (
          [csv_export_max_requirements] >= 1
          AND [csv_export_max_requirements] <= 5000
        );`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class ActionLogCsvExport1719800000000 {
  name = 'ActionLogCsvExport1719800000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default ActionLogCsvExport1719800000000
