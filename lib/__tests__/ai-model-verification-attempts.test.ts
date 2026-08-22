import {
  type AiModelVerificationAttemptError,
  createAiModelVerificationAttemptStore,
} from '@/lib/ai/model-verification-attempts'

describe('AI model verification attempts', () => {
  it('consumes an exact verified attempt only after the save commits', () => {
    let now = Date.parse('2026-08-22T10:00:00Z')
    const store = createAiModelVerificationAttemptStore({ now: () => now })
    const created = store.create({
      actorKey: 'admin-1',
      connectionId: 'connection-1',
      fingerprint: 'fingerprint-1',
      result: { saveable: true },
    })

    const firstLease = store.reserve({
      actorKey: 'admin-1',
      attemptId: created.id,
      connectionId: 'connection-1',
      fingerprint: 'fingerprint-1',
    })
    firstLease.release()

    const retryLease = store.reserve({
      actorKey: 'admin-1',
      attemptId: created.id,
      connectionId: 'connection-1',
      fingerprint: 'fingerprint-1',
    })
    retryLease.commit()

    expect(() =>
      store.reserve({
        actorKey: 'admin-1',
        attemptId: created.id,
        connectionId: 'connection-1',
        fingerprint: 'fingerprint-1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AiModelVerificationAttemptError>>({
        code: 'attempt_unavailable',
      }),
    )

    now += 15 * 60 * 1000
  })

  it('rejects stale or mismatched evidence without exposing another attempt', () => {
    let now = Date.parse('2026-08-22T10:00:00Z')
    const store = createAiModelVerificationAttemptStore({ now: () => now })
    const created = store.create({
      actorKey: 'admin-1',
      connectionId: 'connection-1',
      fingerprint: 'fingerprint-1',
      result: { saveable: true },
    })

    expect(() =>
      store.reserve({
        actorKey: 'admin-2',
        attemptId: created.id,
        connectionId: 'connection-1',
        fingerprint: 'fingerprint-1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AiModelVerificationAttemptError>>({
        code: 'attempt_mismatch',
      }),
    )

    now += 15 * 60 * 1000 + 1
    expect(() =>
      store.reserve({
        actorKey: 'admin-1',
        attemptId: created.id,
        connectionId: 'connection-1',
        fingerprint: 'fingerprint-1',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AiModelVerificationAttemptError>>({
        code: 'attempt_expired',
      }),
    )
  })
})
