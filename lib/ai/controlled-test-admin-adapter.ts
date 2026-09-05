import { randomUUID } from 'node:crypto'
import type {
  AiAdminConnectionAdapter,
  AiAdminConnectionAdapterRegistration,
} from './admin-adapter'
import { AI_ADMIN_PROBE_LIMITS } from './admin-adapter'
import type { AiCapability } from './admin-contracts'
import type { AiAdminCapabilitySupportMap } from './admin-service'
import {
  CONTROLLED_TEST_ADAPTER_TYPE,
  CONTROLLED_TEST_ADAPTER_VERSION,
  controlledTestAdapterRegistration,
} from './controlled-test-adapter'
import { requireAiReasoningConfiguration } from './reasoning'
import type {
  AiConnectionId,
  AiConnectionModelRevisionId,
  AiExternalRunId,
  AiRunProfileId,
} from './run-contracts'
import { AI_REQUEST_PRIVACY_MINIMUM } from './run-contracts'

const ADMIN_PROBE_PROFILE_ID =
  '00000000-0000-4000-8000-000000000865' as AiRunProfileId

function capabilitySupport(
  value: Readonly<AiCapability>,
): AiAdminCapabilitySupportMap {
  return {
    reasoning: value.reasoning ? 'supported' : 'unsupported',
    reasoningControl: value.reasoningControl ? 'supported' : 'unsupported',
    aiAnalysis: value.aiAnalysis ? 'supported' : 'unsupported',
    cost: value.cost ? 'supported' : 'unsupported',
    imageInput: value.imageInput ? 'supported' : 'unsupported',
    jsonSchemaSteering: value.jsonSchemaSteering ? 'supported' : 'unsupported',
    streaming: value.streaming ? 'supported' : 'unsupported',
    tokenUsage: value.tokenUsage ? 'supported' : 'unsupported',
    validatableJson: value.validatableJson ? 'supported' : 'unsupported',
  }
}

const controlledTestAdminAdapter: AiAdminConnectionAdapter = {
  async resolveReasoningConfiguration(_context, candidate) {
    return candidate.externalModelId.startsWith('controlled/default')
      ? { mode: 'model_default', effort: null }
      : {
          mode: 'explicit_control',
          effort: candidate.reasoning.effort ?? 'high',
        }
  },

  async fetchCatalog(context) {
    return context.connection.models.flatMap(model => {
      const revision = model.revisions.reduce<
        (typeof model.revisions)[number] | undefined
      >(
        (selected, candidate) =>
          !selected || candidate.revisionNumber > selected.revisionNumber
            ? candidate
            : selected,
        undefined,
      )
      return revision
        ? [
            {
              capabilities:
                revision.discoveredCapabilities ??
                revision.declaredCapabilities,
              capabilitySupport: capabilitySupport(
                revision.discoveredCapabilities ??
                  revision.declaredCapabilities,
              ),
              externalModelId: revision.externalModelId,
              externalModelVersion: revision.externalModelVersion,
              inputPricePerMillionTokens: null,
              modelProviderName: 'Controlled Test',
              name: model.name,
              outputPricePerMillionTokens: null,
            },
          ]
        : []
    })
  },
  async probeConnection() {
    return {
      details: { adapterReachable: true },
      diagnosticCode: null,
      failureCategory: null,
      outcome: 'passed',
      testSuiteVersion: 'controlled-test-admin-v1',
    }
  },
  runFunctionalProbe(context, revision, probe) {
    const reasoningProbe =
      probe.selectedCapabilities.reasoning ||
      probe.selectedCapabilities.reasoningControl ||
      probe.selectedCapabilities.aiAnalysis
    const output = JSON.stringify({
      probe: probe.selectedCapabilities.imageInput ? 'black-pixel' : 'ok',
      ...(reasoningProbe ? { answer: 4053 } : {}),
    })
    return controlledTestAdapterRegistration.adapter.run({
      connection: {
        configuration: {
          scenario: {
            reasoningEvidence: {
              activity: !revision.externalModelId.endsWith('no-reasoning'),
              control:
                !revision.externalModelId.endsWith('no-reasoning') &&
                revision.reasoning?.mode === 'explicit_control',
            },
            analysis:
              probe.selectedCapabilities.aiAnalysis &&
              !revision.externalModelId.endsWith('no-analysis')
                ? 'Probe analysis'
                : null,
            output,
            outputDeltas: probe.selectedCapabilities.streaming
              ? [output.slice(0, 9), output.slice(9)]
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
        reasoning: requireAiReasoningConfiguration(revision.reasoning),
        configuration: {},
        externalModelId: revision.externalModelId,
        id: revision.id as AiConnectionModelRevisionId,
        verifiedCapabilities: revision.declaredCapabilities,
      },
      privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
      runProfileConfigurationVersion: 1,
      runProfileId: ADMIN_PROBE_PROFILE_ID,
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
        reasoning: requireAiReasoningConfiguration(revision.reasoning),
        configuration: {},
        externalModelId: revision.externalModelId,
        id: revision.id as AiConnectionModelRevisionId,
        verifiedCapabilities: revision.declaredCapabilities,
      },
      privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
      runProfileConfigurationVersion: 1,
      runProfileId: ADMIN_PROBE_PROFILE_ID,
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
        reasoning: requireAiReasoningConfiguration(revision.reasoning),
        configuration: {},
        externalModelId: revision.externalModelId,
        id: revision.id as AiConnectionModelRevisionId,
        verifiedCapabilities: revision.declaredCapabilities,
      },
      privacyPolicy: AI_REQUEST_PRIVACY_MINIMUM,
      runProfileConfigurationVersion: 1,
      runProfileId: ADMIN_PROBE_PROFILE_ID,
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
