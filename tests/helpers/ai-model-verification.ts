import type { AiCapability } from '@/lib/ai/admin-contracts'
import type { AiAdminCandidateVerificationResult } from '@/lib/ai/admin-service'

const CAPABILITIES: AiCapability = {
  reasoning: true,
  reasoningControl: true,
  aiAnalysis: true,
  cost: true,
  imageInput: true,
  jsonSchemaSteering: true,
  streaming: true,
  tokenUsage: true,
  validatableJson: true,
}

export const VERIFICATION: AiAdminCandidateVerificationResult = {
  reasoning: { mode: 'explicit_control' as const, effort: 'high' as const },
  baseline: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified',
  },
  canonicalExternalModelVersion: '2026-08-22',
  capabilities: Object.fromEntries(
    Object.keys(CAPABILITIES).map(key => [
      key,
      key === 'aiAnalysis' || key === 'jsonSchemaSteering'
        ? {
            diagnosticCode: 'upstream_unavailable_http_404',
            failureCategory: 'connection_unavailable',
            outcome: 'inconclusive',
          }
        : { diagnosticCode: null, failureCategory: null, outcome: 'verified' },
    ]),
  ) as AiAdminCandidateVerificationResult['capabilities'],
  connection: {
    diagnosticCode: null,
    failureCategory: null,
    outcome: 'verified',
  },
  profileCompatibility: {
    generation_with_images: {
      diagnosticCode: null,
      failureCategory: null,
      missingCapabilities: [],
      outcome: 'verified',
      supported: true,
    },
    generation_without_images: {
      diagnosticCode: null,
      failureCategory: null,
      missingCapabilities: [],
      outcome: 'verified',
      supported: true,
    },
    invalid_json_repair: {
      diagnosticCode: null,
      failureCategory: null,
      missingCapabilities: [],
      outcome: 'verified',
      supported: true,
    },
  },
  saveable: true,
  testSuiteVersion: 'ai-admin-functional-probe-v2',
}
