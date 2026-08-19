import AiProviderSecrets from '@/typeorm/migrations/0061_ai_provider_secrets.mjs'

describe('AI provider-secret migration', () => {
  it('persists only authenticated ciphertext with immutable binding metadata', async () => {
    const queryRunner = {
      query: vi.fn(async (_sql: string) => undefined),
    }

    await new AiProviderSecrets().up(queryRunner)

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
    expect(sql).not.toMatch(/\[(?:plain_?text|secret|value)\]\s/)
  })

  it('preserves metadata when revoked encrypted material is removed', async () => {
    const queryRunner = {
      query: vi.fn(async (_sql: string) => undefined),
    }

    await new AiProviderSecrets().up(queryRunner)

    const sql = queryRunner.query.mock.calls.map(([value]) => value).join('\n')
    expect(sql).toContain('[provider_revoked_at] datetime2(3) NULL')
    expect(sql).toContain('[ciphertext_deleted_at] datetime2(3) NULL')
    expect(sql).toContain(
      'CONSTRAINT [chk_ai_provider_secret_versions_revocation]',
    )
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::[dbo].[ai_provider_secret_versions]',
    )
  })

  it('drops only the owned table on rollback', async () => {
    const queryRunner = {
      query: vi.fn(async (_sql: string) => undefined),
    }

    await new AiProviderSecrets().down(queryRunner)

    expect(queryRunner.query).toHaveBeenCalledTimes(1)
    expect(queryRunner.query).toHaveBeenCalledWith(
      "IF OBJECT_ID(N'ai_provider_secret_versions', N'U') IS NOT NULL DROP TABLE [ai_provider_secret_versions];",
    )
  })
})
