import AiConnectionsDataModel from '@/typeorm/migrations/0060_ai_connections_data_model.mjs'

describe('AI provider-secret migration', () => {
  it('persists only authenticated ciphertext with immutable binding metadata', async () => {
    const queryRunner = {
      query: vi.fn(async (_sql: string) => undefined),
    }

    await new AiConnectionsDataModel().up(queryRunner)

    const sql = queryRunner.query.mock.calls.map(([value]) => value).join('\n')
    expect(sql).toContain('CREATE TABLE [ai_provider_secret_versions]')
    expect(sql).toContain('[ciphertext] varbinary(max) NULL')
    expect(sql).toContain('[nonce] binary(12) NULL')
    expect(sql).toContain('[authentication_tag] binary(16) NULL')
    expect(sql).toContain('[cipher_format_version] smallint NOT NULL')
    expect(sql).toContain('[root_key_version] nvarchar(100) NOT NULL')
    expect(sql).toContain(
      'CONSTRAINT [uq_ai_provider_secret_versions_connection_revision]',
    )
    expect(sql).toContain(
      'CREATE UNIQUE INDEX [uq_ai_provider_secret_versions_active_connection]',
    )
    expect(sql).toContain(
      'CONSTRAINT [chk_ai_provider_secret_versions_encrypted_material]',
    )
    expect(sql).toContain(
      'CREATE TRIGGER [trg_ai_provider_secret_versions_delete_candidates_only]',
    )
    expect(sql).toContain(
      'IF UPDATE([id]) OR UPDATE([ai_connection_id]) OR UPDATE([revision_number]) OR UPDATE([created_at])',
    )
    expect(sql).not.toMatch(/\[(?:plain_?text|secret|value)\]\s/)
  })

  it('preserves metadata when revoked encrypted material is removed', async () => {
    const queryRunner = {
      query: vi.fn(async (_sql: string) => undefined),
    }

    await new AiConnectionsDataModel().up(queryRunner)

    const sql = queryRunner.query.mock.calls.map(([value]) => value).join('\n')
    expect(sql).toContain('[provider_revoked_at] datetime2(3) NULL')
    expect(sql).toContain('[ciphertext_deleted_at] datetime2(3) NULL')
    expect(sql).toContain(
      'CONSTRAINT [chk_ai_provider_secret_versions_revocation]',
    )
    expect(sql).toContain(
      'GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_provider_secret_versions]',
    )
    expect(sql).toContain(
      'ON OBJECT::[dbo].[ai_provider_secret_versions] TO [kravhantering_runtime]',
    )
    expect(sql).not.toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_provider_secret_versions]',
    )
  })

  it('drops the secret table before its parent connection table on rollback', async () => {
    const queryRunner = {
      query: vi.fn(async (_sql: string) => undefined),
    }

    await new AiConnectionsDataModel().down(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain(
      "IF OBJECT_ID(N'ai_provider_secret_versions', N'U') IS NOT NULL DROP TABLE [ai_provider_secret_versions];",
    )
    expect(
      sql.indexOf('DROP TABLE [ai_provider_secret_versions]'),
    ).toBeLessThan(sql.indexOf('DROP TABLE [ai_connections]'))
  })
})
