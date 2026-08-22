import AiConnectionsDataModel from '@/typeorm/migrations/0060_ai_connections_data_model.mjs'

describe('AI run coordination migration', () => {
  it('creates content-free FIFO queue and distributed lease constraints', async () => {
    const queryRunner = { query: vi.fn(async () => undefined) }

    await new AiConnectionsDataModel().up(queryRunner)

    const sql = (queryRunner.query.mock.calls as unknown[][])
      .map(([value]) => value)
      .join('\n')
    expect(sql).toContain('CREATE TABLE [ai_run_coordination_entries]')
    expect(sql).toContain('[queue_sequence] bigint IDENTITY(1,1)')
    expect(sql).toContain('[lease_expires_at] datetime2(3) NULL')
    expect(sql).toContain('[fencing_token] uniqueidentifier NOT NULL')
    expect(sql).toContain('idx_ai_run_coordination_entries_fifo')
    expect(sql).toContain('[maximum_output_tokens]')
    expect(sql).toContain('[circuit_open_reason]')
    expect(sql).toContain(
      'chk_ai_connection_model_operational_states_circuit_reason',
    )
    expect(sql).not.toContain(
      "SET [circuit_open_reason] = N'connection_unavailable'",
    )
    expect(sql).toContain('GRANT SELECT, INSERT, DELETE')
    expect(sql).toContain(
      'GRANT UPDATE ([status], [attempt_count], [not_before], [lease_owner_id], [lease_expires_at], [cancellation_requested_at], [cancellation_reason], [updated_at])',
    )
    expect(sql).not.toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_run_coordination_entries]',
    )
    expect(sql).not.toMatch(/\[(?:prompt|image|model_output|result|content)\]/u)
  })
})
