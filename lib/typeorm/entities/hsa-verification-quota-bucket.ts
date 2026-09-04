import { EntitySchema } from 'typeorm'

export interface HsaVerificationQuotaBucketEntity {
  actorFingerprint: string | null
  actorSubjectFingerprint: string | null
  bucketKind: 'actor' | 'actor_target' | 'target'
  createdAt: Date
  expiresAt: Date
  id: number
  requestCount: number
  targetFingerprint: string | null
  updatedAt: Date
  windowStartedAt: Date
}

export const hsaVerificationQuotaBucketEntity =
  new EntitySchema<HsaVerificationQuotaBucketEntity>({
    name: 'HsaVerificationQuotaBucket',
    tableName: 'hsa_verification_quota_buckets',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      bucketKind: { length: 16, name: 'bucket_kind', type: 'nvarchar' },
      actorFingerprint: {
        length: 26,
        name: 'actor_fingerprint',
        nullable: true,
        type: 'nvarchar',
      },
      targetFingerprint: {
        length: 26,
        name: 'target_fingerprint',
        nullable: true,
        type: 'nvarchar',
      },
      actorSubjectFingerprint: {
        length: 26,
        name: 'actor_subject_fingerprint',
        nullable: true,
        type: 'nvarchar',
      },
      requestCount: { name: 'request_count', type: 'int' },
      windowStartedAt: { name: 'window_started_at', type: 'datetime2' },
      expiresAt: { name: 'expires_at', type: 'datetime2' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        columns: [
          'bucketKind',
          'actorFingerprint',
          'targetFingerprint',
          'windowStartedAt',
        ],
        name: 'uq_hsa_verification_quota_buckets_identity_window',
        unique: true,
      },
      {
        columns: ['expiresAt'],
        name: 'idx_hsa_verification_quota_buckets_expires_at',
      },
      {
        columns: ['actorSubjectFingerprint'],
        name: 'idx_hsa_verification_quota_buckets_actor_subject',
        where: '[actor_subject_fingerprint] IS NOT NULL',
      },
      {
        columns: ['targetFingerprint'],
        name: 'idx_hsa_verification_quota_buckets_target',
        where: '[target_fingerprint] IS NOT NULL',
      },
    ],
    checks: [
      {
        expression: "[bucket_kind] IN (N'actor', N'actor_target', N'target')",
        name: 'chk_hsa_verification_quota_buckets_kind',
      },
      {
        expression:
          "[actor_fingerprint] IS NULL OR (LEN([actor_fingerprint]) = 26 AND [actor_fingerprint] LIKE N'afp[_]%')",
        name: 'chk_hsa_verification_quota_buckets_actor_fingerprint',
      },
      {
        expression:
          "[target_fingerprint] IS NULL OR (LEN([target_fingerprint]) = 26 AND [target_fingerprint] LIKE N'hfp[_]%')",
        name: 'chk_hsa_verification_quota_buckets_target_fingerprint',
      },
      {
        expression:
          "[actor_subject_fingerprint] IS NULL OR (LEN([actor_subject_fingerprint]) = 26 AND [actor_subject_fingerprint] LIKE N'hfp[_]%')",
        name: 'chk_hsa_verification_quota_buckets_actor_subject_fingerprint',
      },
      {
        expression:
          "([bucket_kind] = N'actor' AND [actor_fingerprint] IS NOT NULL AND [target_fingerprint] IS NULL) OR ([bucket_kind] = N'actor_target' AND [actor_fingerprint] IS NOT NULL AND [target_fingerprint] IS NOT NULL) OR ([bucket_kind] = N'target' AND [actor_fingerprint] IS NULL AND [target_fingerprint] IS NOT NULL AND [actor_subject_fingerprint] IS NULL)",
        name: 'chk_hsa_verification_quota_buckets_shape',
      },
      {
        expression: '[request_count] >= 1 AND [request_count] <= 50',
        name: 'chk_hsa_verification_quota_buckets_request_count',
      },
      {
        expression:
          '[expires_at] = DATEADD(second, 60, [window_started_at]) AND DATEPART(second, [window_started_at]) = 0 AND DATEPART(millisecond, [window_started_at]) = 0',
        name: 'chk_hsa_verification_quota_buckets_window',
      },
      {
        expression:
          '[window_started_at] <= [created_at] AND [created_at] <= [updated_at] AND [updated_at] <= [expires_at]',
        name: 'chk_hsa_verification_quota_buckets_time_order',
      },
    ],
  })
