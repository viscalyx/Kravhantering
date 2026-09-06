const UP_STATEMENTS = [
  `CREATE TABLE [ai_model_verification_attempts] (
    [id] uniqueidentifier NOT NULL,
    [ai_connection_id] uniqueidentifier NOT NULL,
    [fingerprint] nvarchar(64) NOT NULL,
    [payload_json] nvarchar(max) NOT NULL,
    [created_at] datetime2 NOT NULL,
    [expires_at] datetime2 NOT NULL,
    CONSTRAINT [pk_ai_model_verification_attempts] PRIMARY KEY ([id]),
    CONSTRAINT [chk_ai_model_verification_attempts_payload] CHECK (ISJSON([payload_json]) = 1 AND DATALENGTH([payload_json]) <= 65536),
    CONSTRAINT [chk_ai_model_verification_attempts_ttl] CHECK ([expires_at] = DATEADD(minute, 15, [created_at]))
  );`,
  `ALTER TABLE [ai_model_verification_attempts] ADD CONSTRAINT [fk_ai_model_verification_attempts_ai_connection_id] FOREIGN KEY ([ai_connection_id]) REFERENCES [ai_connections] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;`,
  `CREATE INDEX [idx_ai_model_verification_attempts_expires_at] ON [ai_model_verification_attempts] ([expires_at]);`,
  `CREATE INDEX [idx_ai_model_verification_attempts_ai_connection_id] ON [ai_model_verification_attempts] ([ai_connection_id], [expires_at]);`,
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NOT NULL
    GRANT SELECT, INSERT, DELETE ON OBJECT::[dbo].[ai_model_verification_attempts] TO [kravhantering_runtime];`,
]
const DOWN_STATEMENTS = ['DROP TABLE [ai_model_verification_attempts];']
export class AiModelVerificationAttempts1721000000000 {
  name = 'AiModelVerificationAttempts1721000000000'
  async up(queryRunner) {
    for (const statement of UP_STATEMENTS) await queryRunner.query(statement)
  }
  async down(queryRunner) {
    for (const statement of DOWN_STATEMENTS) await queryRunner.query(statement)
  }
}
export default AiModelVerificationAttempts1721000000000
