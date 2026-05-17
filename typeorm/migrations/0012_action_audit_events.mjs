const UP_STATEMENTS = [
  `CREATE TABLE [action_audit_events] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [occurred_at] datetime2(3) NOT NULL,
  [actor_hsa_id] nvarchar(64) NULL,
  [actor_display_name] nvarchar(max) NULL,
  [actor_kind] nvarchar(32) NOT NULL,
  [actor_client_id] nvarchar(255) NULL,
  [action] nvarchar(64) NOT NULL,
  [target_kind] nvarchar(64) NOT NULL,
  [target_id] nvarchar(255) NULL,
  [target_unique_id] nvarchar(255) NULL,
  [decision] nvarchar(16) NOT NULL,
  [denial_reason] nvarchar(255) NULL,
  [request_id] nvarchar(64) NULL,
  [correlation_id] nvarchar(64) NULL,
  [client_ip] nvarchar(45) NULL,
  [details_json] nvarchar(max) NULL,
  CONSTRAINT [pk_action_audit_events] PRIMARY KEY ([id]),
  CONSTRAINT [chk_action_audit_events_actor_kind] CHECK ([actor_kind] IN (N'user', N'mcp_client', N'system')),
  CONSTRAINT [chk_action_audit_events_decision] CHECK ([decision] IN (N'allowed', N'denied'))
);`,
  'CREATE INDEX [idx_action_audit_events_occurred_at] ON [action_audit_events] ([occurred_at] DESC);',
  'CREATE INDEX [idx_action_audit_events_actor_hsa_id_occurred_at] ON [action_audit_events] ([actor_hsa_id], [occurred_at] DESC);',
  'CREATE INDEX [idx_action_audit_events_target_occurred_at] ON [action_audit_events] ([target_kind], [target_id], [occurred_at] DESC);',
  'CREATE INDEX [idx_action_audit_events_action_occurred_at] ON [action_audit_events] ([action], [occurred_at] DESC);',
  'CREATE INDEX [idx_action_audit_events_client_ip_occurred_at] ON [action_audit_events] ([client_ip], [occurred_at] DESC);',
]

const DOWN_STATEMENTS = [
  "IF OBJECT_ID(N'action_audit_events', N'U') IS NOT NULL DROP TABLE [action_audit_events];",
]

export class ActionAuditEvents1715900000000 {
  name = 'ActionAuditEvents1715900000000'

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

export default ActionAuditEvents1715900000000
