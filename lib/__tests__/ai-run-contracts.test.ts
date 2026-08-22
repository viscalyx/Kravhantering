import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  type AIConnectionAdapter,
  type AIIntegrationLayer,
  type AiConnectionId,
  type AiConnectionModelRevisionId,
  type AiRunEvent,
  type AiRunIdentity,
  type AiRunProfileId,
  createAiAdapterRunContext,
  guardAiRunEventStream,
} from '@/lib/ai/run-contracts'

const RUN_IDENTITY: AiRunIdentity = {
  aiConnectionId: 'connection-17' as AiConnectionId,
  aiConnectionModelRevisionId:
    'model-revision-23' as AiConnectionModelRevisionId,
  aiRunProfileConfigurationVersion: 1,
  aiRunProfileId: 'profile-revision-31' as AiRunProfileId,
}

async function collectEvents(
  events: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const collected: AiRunEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

describe('AI run contracts', () => {
  it('shares the complete internal event stream across both run ports', () => {
    expectTypeOf<ReturnType<AIIntegrationLayer['run']>>().toEqualTypeOf<
      AsyncIterable<AiRunEvent>
    >()
    expectTypeOf<ReturnType<AIConnectionAdapter['run']>>().toEqualTypeOf<
      AsyncIterable<AiRunEvent>
    >()
    expectTypeOf<
      Extract<AiRunEvent, { identity: AiRunIdentity }>['type']
    >().toEqualTypeOf<'cancelled' | 'completed' | 'failed'>()
    expectTypeOf<
      Extract<AiRunEvent, { type: 'output_delta' }>
    >().toEqualTypeOf<{
      delta: string
      type: 'output_delta'
      visibility: 'internal'
    }>()
  })

  it('keeps stable connection, model revision, and profile revision IDs distinct', () => {
    expectTypeOf<AiConnectionId>().not.toEqualTypeOf<AiConnectionModelRevisionId>()
    expectTypeOf<AiConnectionId>().not.toEqualTypeOf<AiRunProfileId>()
    expectTypeOf<AiConnectionModelRevisionId>().not.toEqualTypeOf<AiRunProfileId>()
  })

  it('replaces internal trace identifiers with a unique opaque adapter run identifier', () => {
    const abortController = new AbortController()
    const context = {
      abortSignal: abortController.signal,
      applicationRunId: 'application-run-sensitive-123',
      correlationId: 'correlation-sensitive-456',
      deadlineAt: '2026-08-19T12:00:00.000Z',
    }

    const egress = { fetch: vi.fn() }
    const first = createAiAdapterRunContext(context, egress)
    const second = createAiAdapterRunContext(context, egress)

    expect(first).toEqual({
      abortSignal: abortController.signal,
      deadlineAt: '2026-08-19T12:00:00.000Z',
      egress,
      externalRunId: expect.stringMatching(
        /^airun_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
    })
    expect(second.externalRunId).not.toBe(first.externalRunId)
    expect(JSON.stringify(first)).not.toMatch(
      /application-run-sensitive|correlation-sensitive/u,
    )
  })

  it('turns silent end-of-stream into one invalid-response terminal event', async () => {
    async function* silentStream(): AsyncIterable<AiRunEvent> {
      yield { delta: 'working', type: 'analysis_delta' }
    }

    await expect(
      collectEvents(guardAiRunEventStream(silentStream(), RUN_IDENTITY)),
    ).resolves.toEqual([
      { delta: 'working', type: 'analysis_delta' },
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'silent_eof',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
  })

  it('replaces multiple terminal events with one invalid-response event', async () => {
    async function* invalidStream(): AsyncIterable<AiRunEvent> {
      yield {
        failure: {
          category: 'authentication_failed',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      }
      yield {
        failure: {
          category: 'connection_unavailable',
          retryable: true,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      }
    }

    await expect(
      collectEvents(guardAiRunEventStream(invalidStream(), RUN_IDENTITY)),
    ).resolves.toEqual([
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'multiple_terminal_events',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
  })

  it('normalizes thrown adapter details without exposing their message', async () => {
    async function* brokenStream(): AsyncIterable<AiRunEvent> {
      yield* [] as AiRunEvent[]
      throw new Error('https://provider.test token=do-not-expose')
    }

    const events = await collectEvents(
      guardAiRunEventStream(brokenStream(), RUN_IDENTITY),
    )

    expect(events).toEqual([
      {
        failure: {
          category: 'adapter_failure',
          diagnosticCode: 'adapter_stream_threw',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
    expect(JSON.stringify(events)).not.toMatch(/provider|do-not-expose/u)
  })

  it('rejects a terminal event carrying different resolved revision identities', async () => {
    async function* mismatchedStream(): AsyncIterable<AiRunEvent> {
      yield {
        failure: { category: 'adapter_failure', retryable: false },
        identity: {
          ...RUN_IDENTITY,
          aiConnectionId: 'other-connection' as AiConnectionId,
        },
        type: 'failed',
      }
    }

    await expect(
      collectEvents(guardAiRunEventStream(mismatchedStream(), RUN_IDENTITY)),
    ).resolves.toEqual([
      {
        failure: {
          category: 'invalid_response',
          diagnosticCode: 'terminal_identity_mismatch',
          retryable: false,
        },
        identity: RUN_IDENTITY,
        type: 'failed',
      },
    ])
  })
})
