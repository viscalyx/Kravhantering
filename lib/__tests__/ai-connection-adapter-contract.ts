import { describe, expect, it } from 'vitest'
import { createAiConnectionAdapterRegistry } from '@/lib/ai/adapter-registry'
import type {
  AiConnectionAdapterRegistration,
  AiConnectionAdapterRunRequest,
  AiRunEvent,
  AiRunUsage,
} from '@/lib/ai/run-contracts'

export const ADAPTER_CONTRACT_USAGE: AiRunUsage = {
  analysisTokens: { status: 'reported', value: 2 },
  cost: {
    status: 'reported',
    value: { amount: '0.0042', currency: 'USD' },
  },
  inputTokens: { status: 'reported', value: 12 },
  outputTokens: { status: 'reported', value: 7 },
  totalTokens: { status: 'reported', value: 19 },
}

export interface AiConnectionAdapterContractHarness {
  adapterType: string
  completedRequest(): AiConnectionAdapterRunRequest
  missingCapabilityRequest(): AiConnectionAdapterRunRequest
  registration: AiConnectionAdapterRegistration
  waitForAbortRequest(signal: AbortSignal): AiConnectionAdapterRunRequest
}

async function collectEvents(
  events: AsyncIterable<AiRunEvent>,
): Promise<AiRunEvent[]> {
  const collected: AiRunEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

export function describeAiConnectionAdapterContract(
  name: string,
  createHarness: () => AiConnectionAdapterContractHarness,
): void {
  describe(`${name} shared AI connection adapter contract`, () => {
    it('is registrable and returns complete output only in its terminal event', async () => {
      const harness = createHarness()
      const adapter = createAiConnectionAdapterRegistry([
        harness.registration,
      ]).resolve(harness.adapterType, harness.registration.adapterVersion)

      const events = await collectEvents(
        adapter.run(harness.completedRequest()),
      )

      expect(events).toEqual([
        { delta: 'partial analysis', type: 'analysis_delta' },
        {
          delta: '{"requirements"',
          type: 'output_delta',
          visibility: 'internal',
        },
        { delta: ':[]}', type: 'output_delta', visibility: 'internal' },
        {
          analysis: 'partial analysis',
          identity: {
            aiConnectionId: 'connection-17',
            aiConnectionModelRevisionId: 'model-revision-23',
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: 'profile-31',
          },
          rawOutput: '{"requirements":[]}',
          type: 'completed',
          usage: ADAPTER_CONTRACT_USAGE,
        },
      ])
    })

    it('turns application abort into one normalized cancellation', async () => {
      const controller = new AbortController()
      const harness = createHarness()
      const adapter = harness.registration.adapter
      const eventsPromise = collectEvents(
        adapter.run(harness.waitForAbortRequest(controller.signal)),
      )

      await Promise.resolve()
      controller.abort()

      await expect(eventsPromise).resolves.toEqual([
        {
          identity: {
            aiConnectionId: 'connection-17',
            aiConnectionModelRevisionId: 'model-revision-23',
            aiRunProfileConfigurationVersion: 1,
            aiRunProfileId: 'profile-31',
          },
          reason: 'application_cancelled',
          type: 'cancelled',
        },
      ])
    })

    it('rejects a selected capability absent from the verified model revision', async () => {
      const harness = createHarness()

      const events = await collectEvents(
        harness.registration.adapter.run(harness.missingCapabilityRequest()),
      )

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        failure: { category: 'capability_mismatch', retryable: false },
        identity: {
          aiConnectionId: 'connection-17',
          aiConnectionModelRevisionId: 'model-revision-23',
          aiRunProfileConfigurationVersion: 1,
          aiRunProfileId: 'profile-31',
        },
        type: 'failed',
      })
    })
  })
}
