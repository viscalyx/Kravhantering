import { randomUUID } from 'node:crypto'
import type {
  AiAdminConnectionAdapter,
  AiAdminConnectionAdapterRegistration,
} from './admin-adapter'
import { AI_ADMIN_PROBE_LIMITS } from './admin-adapter'
import {
  CONTROLLED_TEST_ADAPTER_TYPE,
  CONTROLLED_TEST_ADAPTER_VERSION,
  controlledTestAdapterRegistration,
} from './controlled-test-adapter'
import type {
  AiConnectionId,
  AiConnectionModelRevisionId,
  AiExternalRunId,
  AiRunProfileRevisionId,
} from './run-contracts'
import { AI_REQUEST_PRIVACY_MINIMUM } from './run-contracts'

const ADMIN_PROBE_PROFILE_REVISION_ID =
  '00000000-0000-4000-8000-000000000865' as AiRunProfileRevisionId

const controlledTestAdminAdapter: AiAdminConnectionAdapter = {
  async fetchCatalog(context) {
    return context.connection.models.flatMap(model =>
      model.revisions.slice(0, 1).map(revision => ({
        capabilities:
          revision.discoveredCapabilities ?? revision.declaredCapabilities,
        externalModelId: revision.externalModelId,
        externalModelVersion: revision.externalModelVersion,
        name: model.name,
      })),
    )
  },
  async probeConnection() {
    return {
      details: { adapterReachable: true },
      failureCategory: null,
      outcome: 'passed',
      testSuiteVersion: 'controlled-test-admin-v1',
    }
  },
  runFunctionalProbe(context, revision, probe) {
    return controlledTestAdapterRegistration.adapter.run({
      connection: {
        configuration: {
          scenario: {
            analysis: probe.selectedCapabilities.aiAnalysis
              ? 'Probe analysis'
              : null,
            output: '{"probe":"ok"}',
            outputDeltas: probe.selectedCapabilities.streaming
              ? ['{"probe":', '"ok"}']
              : undefined,
            type: 'completed',
            usage: {
              analysisTokens: { status: 'reported', value: 1 },
              cost: {
                status: 'reported',
                value: { amount: '0', currency: 'USD' },
              },
              inputTokens: { status: 'reported', value: 1 },
              outputTokens: { status: 'reported', value: 1 },
              totalTokens: { status: 'reported', value: 2 },
            },
          },
        },
        id: context.connection.id as AiConnectionId,
      },
      context: {
        abortSignal: probe.abortSignal,
        deadlineAt: probe.deadlineAt,
        egress: context.egress,
        externalRunId: `admin_probe_${randomUUID()}` as AiExternalRunId,
      },
      limits: AI_ADMIN_PROBE_LIMITS,
      modelRevision: {
        configuration: {},
        externalModelId: revision.externalModelId,
        id: revision.id as AiConnectionModelRevisionId,
        verifiedCapabilities: revision.declaredCapabilities,
      },
      privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
      runProfileRevisionId: ADMIN_PROBE_PROFILE_REVISION_ID,
      selectedCapabilities: probe.selectedCapabilities,
      task: probe.task,
    })
  },
  runActivationCancellationProbe(context, revision, probe) {
    return controlledTestAdapterRegistration.adapter.run({
      connection: {
        configuration: { scenario: { type: 'wait_for_abort' } },
        id: context.connection.id as AiConnectionId,
      },
      context: {
        abortSignal: probe.abortSignal,
        deadlineAt: probe.deadlineAt,
        egress: context.egress,
        externalRunId: `admin_probe_${randomUUID()}` as AiExternalRunId,
      },
      limits: AI_ADMIN_PROBE_LIMITS,
      modelRevision: {
        configuration: {},
        externalModelId: revision.externalModelId,
        id: revision.id as AiConnectionModelRevisionId,
        verifiedCapabilities: revision.declaredCapabilities,
      },
      privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
      runProfileRevisionId: ADMIN_PROBE_PROFILE_REVISION_ID,
      selectedCapabilities: probe.selectedCapabilities,
      task: probe.task,
    })
  },
  runActivationNegativeProbe(context, revision, probe, negativeCase) {
    return controlledTestAdapterRegistration.adapter.run({
      connection: {
        configuration: {
          scenario: {
            category:
              negativeCase === 'safe_provider_error'
                ? 'connection_unavailable'
                : 'invalid_response',
            diagnosticCode: 'normalized_conformance_failure',
            retryable: false,
            type: 'failed',
          },
        },
        id: context.connection.id as AiConnectionId,
      },
      context: {
        abortSignal: probe.abortSignal,
        deadlineAt: probe.deadlineAt,
        egress: context.egress,
        externalRunId: `admin_probe_${randomUUID()}` as AiExternalRunId,
      },
      limits: AI_ADMIN_PROBE_LIMITS,
      modelRevision: {
        configuration: {},
        externalModelId: revision.externalModelId,
        id: revision.id as AiConnectionModelRevisionId,
        verifiedCapabilities: revision.declaredCapabilities,
      },
      privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
      runProfileRevisionId: ADMIN_PROBE_PROFILE_REVISION_ID,
      selectedCapabilities: probe.selectedCapabilities,
      task: probe.task,
    })
  },
  async verifySecretCandidate(context) {
    if (
      context.connection.authenticationType !== 'none' &&
      !context.credential
    ) {
      throw new Error('The controlled test credential is empty.')
    }
  },
}

export const controlledTestAdminAdapterRegistration = Object.freeze({
  adapter: controlledTestAdminAdapter,
  adapterType: CONTROLLED_TEST_ADAPTER_TYPE,
  adapterVersion: CONTROLLED_TEST_ADAPTER_VERSION,
  executionKind: 'controlled_offline',
}) satisfies AiAdminConnectionAdapterRegistration
