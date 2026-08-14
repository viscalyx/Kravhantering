import { EntitySchema } from 'typeorm'

export interface RequirementImportValidationRateBucketEntity {
  createdAt: Date
  expiresAt: Date
  id: number
  principalFingerprint: string
  successfulCreations: number
  updatedAt: Date
  windowStartedAt: Date
}

export const requirementImportValidationRateBucketEntity =
  new EntitySchema<RequirementImportValidationRateBucketEntity>({
    name: 'RequirementImportValidationRateBucket',
    tableName: 'requirement_import_validation_rate_buckets',
    columns: {
      id: {
        generated: 'increment',
        name: 'id',
        primary: true,
        type: 'int',
      },
      principalFingerprint: {
        length: 64,
        name: 'principal_fingerprint',
        type: 'nvarchar',
      },
      windowStartedAt: {
        name: 'window_started_at',
        type: 'datetime2',
      },
      successfulCreations: {
        name: 'successful_creations',
        type: 'int',
      },
      expiresAt: { name: 'expires_at', type: 'datetime2' },
      createdAt: { name: 'created_at', type: 'datetime2' },
      updatedAt: { name: 'updated_at', type: 'datetime2' },
    },
    indices: [
      {
        columns: ['principalFingerprint', 'windowStartedAt'],
        name: 'uq_requirement_import_validation_rate_buckets_principal_window',
        unique: true,
      },
      {
        columns: ['expiresAt'],
        name: 'idx_requirement_import_validation_rate_buckets_expires_at',
      },
    ],
    checks: [
      {
        expression: 'LEN([principal_fingerprint]) = 64',
        name: 'chk_requirement_import_validation_rate_buckets_principal_fingerprint',
      },
      {
        expression:
          '[successful_creations] >= 1 AND [successful_creations] <= 200',
        name: 'chk_requirement_import_validation_rate_buckets_successful_creations',
      },
      {
        expression: '[expires_at] > [window_started_at]',
        name: 'chk_requirement_import_validation_rate_buckets_window',
      },
    ],
  })
