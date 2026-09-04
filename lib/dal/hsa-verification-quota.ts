import type { SqlServerDatabase, SqlServerEntityManager } from '@/lib/db'

export const HSA_VERIFICATION_QUOTA_LIMITS = Object.freeze({
  actor: 50,
  actorTarget: 10,
  target: 10,
})

export const HSA_VERIFICATION_QUOTA_WINDOW_SECONDS = 60
export const HSA_VERIFICATION_QUOTA_LOCK_TIMEOUT_MS = 1_000

export type HsaVerificationQuotaBucketKind = 'actor' | 'actor_target' | 'target'

export interface HsaVerificationQuotaInput {
  actorFingerprint: string
  actorSubjectFingerprint: string | null
  targetFingerprint: string
}

export type HsaVerificationQuotaDecision =
  | { allowed: true }
  | {
      allowed: false
      bucket: HsaVerificationQuotaBucketKind
      retryAfterSeconds: number
    }

interface QuotaClockRow {
  now: Date | string
  windowEnd: Date | string
  windowStart: Date | string
}

interface QuotaIncrementRow {
  allowed: number | string
}

interface BucketPolicy {
  actorFingerprint: string | null
  actorSubjectFingerprint: string | null
  kind: HsaVerificationQuotaBucketKind
  limit: number
  targetFingerprint: string | null
}

const ACTOR_FINGERPRINT_PATTERN = /^afp_[A-Za-z0-9_-]{22}$/u
const TARGET_FINGERPRINT_PATTERN = /^hfp_[A-Za-z0-9_-]{22}$/u

function assertFingerprint(value: string, pattern: RegExp, name: string): void {
  if (!pattern.test(value)) {
    throw new Error(`Invalid HSA verification quota ${name}`)
  }
}

function assertInput(input: HsaVerificationQuotaInput): void {
  assertFingerprint(
    input.actorFingerprint,
    ACTOR_FINGERPRINT_PATTERN,
    'actor fingerprint',
  )
  assertFingerprint(
    input.targetFingerprint,
    TARGET_FINGERPRINT_PATTERN,
    'target fingerprint',
  )
  if (input.actorSubjectFingerprint !== null) {
    assertFingerprint(
      input.actorSubjectFingerprint,
      TARGET_FINGERPRINT_PATTERN,
      'actor subject fingerprint',
    )
  }
}

function lockResource(policy: BucketPolicy): string {
  return [
    'kravhantering:hsa-verification-quota:v1',
    policy.kind,
    policy.actorFingerprint ?? '-',
    policy.targetFingerprint ?? '-',
  ].join(':')
}

async function consumeBucket(
  manager: SqlServerEntityManager,
  policy: BucketPolicy,
  clock: { now: Date; windowEnd: Date; windowStart: Date },
): Promise<boolean> {
  const rows = await manager.query<QuotaIncrementRow[]>(
    `DECLARE @lock_result int;
     EXEC @lock_result = sys.sp_getapplock
       @Resource = @0,
       @LockMode = N'Exclusive',
       @LockOwner = N'Transaction',
       @LockTimeout = ${HSA_VERIFICATION_QUOTA_LOCK_TIMEOUT_MS};
     IF @lock_result < 0
       THROW 51061, 'HSA verification quota coordination failed.', 1;

     DECLARE @current_count int;
     SELECT @current_count = request_count
     FROM hsa_verification_quota_buckets WITH (UPDLOCK, HOLDLOCK)
     WHERE bucket_kind = @1
       AND (
         actor_fingerprint = @2
         OR (actor_fingerprint IS NULL AND @2 IS NULL)
       )
       AND (
         target_fingerprint = @3
         OR (target_fingerprint IS NULL AND @3 IS NULL)
       )
       AND window_started_at = @6;

     IF @current_count >= @5
       SELECT CONVERT(bit, 0) AS allowed;
     ELSE
     BEGIN
       IF @current_count IS NULL
         INSERT INTO hsa_verification_quota_buckets (
           bucket_kind,
           actor_fingerprint,
           target_fingerprint,
           actor_subject_fingerprint,
           request_count,
           window_started_at,
           expires_at,
           created_at,
           updated_at
         ) VALUES (@1, @2, @3, @4, 1, @6, @7, @8, @8);
       ELSE
         UPDATE hsa_verification_quota_buckets
         SET request_count = request_count + 1,
             actor_subject_fingerprint = COALESCE(
               actor_subject_fingerprint,
               @4
             ),
             updated_at = CASE
               WHEN updated_at > @8 THEN updated_at
               ELSE @8
             END
         WHERE bucket_kind = @1
           AND (
             actor_fingerprint = @2
             OR (actor_fingerprint IS NULL AND @2 IS NULL)
           )
           AND (
             target_fingerprint = @3
             OR (target_fingerprint IS NULL AND @3 IS NULL)
           )
           AND window_started_at = @6;
       SELECT CONVERT(bit, 1) AS allowed;
     END;`,
    [
      lockResource(policy),
      policy.kind,
      policy.actorFingerprint,
      policy.targetFingerprint,
      policy.actorSubjectFingerprint,
      policy.limit,
      clock.windowStart,
      clock.windowEnd,
      clock.now,
    ],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('HSA verification quota decision is unavailable')
  }
  return Boolean(Number(row.allowed))
}

function retryAfterSeconds(now: Date, windowEnd: Date): number {
  return Math.max(
    1,
    Math.min(
      HSA_VERIFICATION_QUOTA_WINDOW_SECONDS,
      Math.ceil((windowEnd.getTime() - now.getTime()) / 1_000),
    ),
  )
}

export async function consumeHsaVerificationQuota(
  db: SqlServerDatabase,
  input: HsaVerificationQuotaInput,
): Promise<HsaVerificationQuotaDecision> {
  assertInput(input)
  return db.transaction('SERIALIZABLE', async manager => {
    const clockRows = await manager.query<QuotaClockRow[]>(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @window_start datetime2(3) = DATEADD(
         minute,
         DATEDIFF_BIG(
           minute,
           CONVERT(datetime2(3), '1970-01-01'),
           @now
         ),
         CONVERT(datetime2(3), '1970-01-01')
       );
       SELECT
         @now AS now,
         @window_start AS windowStart,
         DATEADD(second, ${HSA_VERIFICATION_QUOTA_WINDOW_SECONDS}, @window_start)
           AS windowEnd;`,
    )
    const clockRow = clockRows[0]
    if (!clockRow) {
      throw new Error('HSA verification quota clock is unavailable')
    }
    const clock = {
      now: new Date(clockRow.now),
      windowEnd: new Date(clockRow.windowEnd),
      windowStart: new Date(clockRow.windowStart),
    }
    const policies: BucketPolicy[] = [
      {
        actorFingerprint: input.actorFingerprint,
        actorSubjectFingerprint: input.actorSubjectFingerprint,
        kind: 'actor',
        limit: HSA_VERIFICATION_QUOTA_LIMITS.actor,
        targetFingerprint: null,
      },
      {
        actorFingerprint: input.actorFingerprint,
        actorSubjectFingerprint: input.actorSubjectFingerprint,
        kind: 'actor_target',
        limit: HSA_VERIFICATION_QUOTA_LIMITS.actorTarget,
        targetFingerprint: input.targetFingerprint,
      },
      {
        actorFingerprint: null,
        actorSubjectFingerprint: null,
        kind: 'target',
        limit: HSA_VERIFICATION_QUOTA_LIMITS.target,
        targetFingerprint: input.targetFingerprint,
      },
    ]

    for (const policy of policies) {
      if (!(await consumeBucket(manager, policy, clock))) {
        return {
          allowed: false,
          bucket: policy.kind,
          retryAfterSeconds: retryAfterSeconds(clock.now, clock.windowEnd),
        }
      }
    }
    return { allowed: true }
  })
}
