import AiRunCoordination from '@/typeorm/migrations/0062_ai_run_coordination.mjs'

describe('AI run coordination migration', () => {
  it('creates content-free FIFO queue and distributed lease constraints', async () => {
    const queryRunner = { query: vi.fn(async () => undefined) }

    await new AiRunCoordination().up(queryRunner)

    const sql = (queryRunner.query.mock.calls as unknown[][])
      .map(([value]) => value)
      .join('\n')
    expect(sql).toContain('CREATE TABLE [ai_run_coordination_entries]')
    expect(sql).toContain('[queue_sequence] bigint IDENTITY(1,1)')
    expect(sql).toContain('[lease_expires_at] datetime2(3) NULL')
    expect(sql).toContain('idx_ai_run_coordination_entries_fifo')
    expect(sql).toContain('[maximum_output_tokens]')
    expect(sql).toContain('[circuit_open_reason]')
    expect(sql).not.toMatch(/\[(?:prompt|image|model_output|result|content)\]/u)
  })
})
