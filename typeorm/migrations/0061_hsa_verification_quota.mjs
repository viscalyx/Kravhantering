const UP_STATEMENTS = [
  `IF OBJECT_ID(N'hsa_verification_quota_buckets', N'U') IS NULL
    CREATE TABLE [hsa_verification_quota_buckets] (
      [id] int IDENTITY(1,1) NOT NULL,
      [bucket_kind] nvarchar(16) NOT NULL,
      [actor_fingerprint] nvarchar(26) NULL,
      [target_fingerprint] nvarchar(26) NULL,
      [actor_subject_fingerprint] nvarchar(26) NULL,
      [request_count] int NOT NULL,
      [window_started_at] datetime2(3) NOT NULL,
      [expires_at] datetime2(3) NOT NULL,
      [created_at] datetime2(3) NOT NULL,
      [updated_at] datetime2(3) NOT NULL,
      CONSTRAINT [pk_hsa_verification_quota_buckets] PRIMARY KEY ([id]),
      CONSTRAINT [chk_hsa_verification_quota_buckets_kind]
        CHECK ([bucket_kind] IN (N'actor', N'actor_target', N'target')),
      CONSTRAINT [chk_hsa_verification_quota_buckets_actor_fingerprint]
        CHECK (
          [actor_fingerprint] IS NULL
          OR (
            LEN([actor_fingerprint]) = 26
            AND [actor_fingerprint] LIKE N'afp[_]%'
          )
        ),
      CONSTRAINT [chk_hsa_verification_quota_buckets_target_fingerprint]
        CHECK (
          [target_fingerprint] IS NULL
          OR (
            LEN([target_fingerprint]) = 26
            AND [target_fingerprint] LIKE N'hfp[_]%'
          )
        ),
      CONSTRAINT [chk_hsa_verification_quota_buckets_actor_subject_fingerprint]
        CHECK (
          [actor_subject_fingerprint] IS NULL
          OR (
            LEN([actor_subject_fingerprint]) = 26
            AND [actor_subject_fingerprint] LIKE N'hfp[_]%'
          )
        ),
      CONSTRAINT [chk_hsa_verification_quota_buckets_shape]
        CHECK (
          (
            [bucket_kind] = N'actor'
            AND [actor_fingerprint] IS NOT NULL
            AND [target_fingerprint] IS NULL
          )
          OR (
            [bucket_kind] = N'actor_target'
            AND [actor_fingerprint] IS NOT NULL
            AND [target_fingerprint] IS NOT NULL
          )
          OR (
            [bucket_kind] = N'target'
            AND [actor_fingerprint] IS NULL
            AND [target_fingerprint] IS NOT NULL
            AND [actor_subject_fingerprint] IS NULL
          )
        ),
      CONSTRAINT [chk_hsa_verification_quota_buckets_request_count]
        CHECK ([request_count] >= 1 AND [request_count] <= 50),
      CONSTRAINT [chk_hsa_verification_quota_buckets_window]
        CHECK (
          [expires_at] = DATEADD(second, 60, [window_started_at])
          AND DATEPART(second, [window_started_at]) = 0
          AND DATEPART(millisecond, [window_started_at]) = 0
        ),
      CONSTRAINT [chk_hsa_verification_quota_buckets_time_order]
        CHECK (
          [window_started_at] <= [created_at]
          AND [created_at] <= [updated_at]
          AND [updated_at] <= [expires_at]
        )
    );`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'uq_hsa_verification_quota_buckets_identity_window'
        AND object_id = OBJECT_ID(N'hsa_verification_quota_buckets')
    )
    CREATE UNIQUE INDEX [uq_hsa_verification_quota_buckets_identity_window]
      ON [hsa_verification_quota_buckets] (
        [bucket_kind],
        [actor_fingerprint],
        [target_fingerprint],
        [window_started_at]
      );`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_hsa_verification_quota_buckets_expires_at'
        AND object_id = OBJECT_ID(N'hsa_verification_quota_buckets')
    )
    CREATE INDEX [idx_hsa_verification_quota_buckets_expires_at]
      ON [hsa_verification_quota_buckets] ([expires_at]);`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_hsa_verification_quota_buckets_actor_subject'
        AND object_id = OBJECT_ID(N'hsa_verification_quota_buckets')
    )
    CREATE INDEX [idx_hsa_verification_quota_buckets_actor_subject]
      ON [hsa_verification_quota_buckets] ([actor_subject_fingerprint])
      WHERE [actor_subject_fingerprint] IS NOT NULL;`,
  `IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'idx_hsa_verification_quota_buckets_target'
        AND object_id = OBJECT_ID(N'hsa_verification_quota_buckets')
    )
    CREATE INDEX [idx_hsa_verification_quota_buckets_target]
      ON [hsa_verification_quota_buckets] ([target_fingerprint])
      WHERE [target_fingerprint] IS NOT NULL;`,
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NULL
    THROW 51022, 'Runtime permission role is missing.', 1;
  GRANT SELECT, INSERT, UPDATE, DELETE
    ON OBJECT::[dbo].[hsa_verification_quota_buckets]
    TO [kravhantering_runtime];`,
]

const DOWN_STATEMENTS = [
  `IF DATABASE_PRINCIPAL_ID(N'kravhantering_runtime') IS NOT NULL
    REVOKE SELECT, INSERT, UPDATE, DELETE
      ON OBJECT::[dbo].[hsa_verification_quota_buckets]
      FROM [kravhantering_runtime];`,
  `IF OBJECT_ID(N'hsa_verification_quota_buckets', N'U') IS NOT NULL
    DROP TABLE [hsa_verification_quota_buckets];`,
]

async function runStatements(queryRunner, statements) {
  for (const statement of statements) {
    await queryRunner.query(statement)
  }
}

export class HsaVerificationQuota1720800000000 {
  name = 'HsaVerificationQuota1720800000000'

  async up(queryRunner) {
    await runStatements(queryRunner, UP_STATEMENTS)
  }

  async down(queryRunner) {
    await runStatements(queryRunner, DOWN_STATEMENTS)
  }
}

export default HsaVerificationQuota1720800000000
