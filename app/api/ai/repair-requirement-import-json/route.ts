import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateChat } from '@/lib/ai/openrouter-client'
import { resolveOpenRouterModelCapabilities } from '@/lib/ai/openrouter-model-catalog'
import {
  aiProviderErrorPayload,
  isAiProviderCallerCancelledError,
  normalizeAiProviderError,
} from '@/lib/ai/provider-errors'
import {
  buildRequirementImportRepairPrompt,
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
} from '@/lib/ai/requirement-prompt'
import {
  recordAiSafetyBlock,
  recordAiSafetyFilterFailure,
  screenAiOutputDetailed,
} from '@/lib/ai/safety'
import { getAiGenerationAvailability } from '@/lib/dal/ai-settings'
import { getApplicationSettings } from '@/lib/dal/application-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  AI_PROVIDER_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { readBoundedJsonWithSchema } from '@/lib/http/validation'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import {
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
  type RequirementImportBudget,
  requirementImportBudgetFromSettings,
  validateImportContentBudget,
} from '@/lib/requirements/import-budget'
import {
  buildRequirementsImportPayloadSchema,
  type ImportRequirementsPayload,
} from '@/lib/requirements/import-schema'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import {
  aiRequirementImportBaseBodySchema,
  checkAiRequirementImportThrottle,
  createAiRequirementImportThrottleResponse,
  formatAiSafetyBlockedMessage,
  guardAiInput,
  MAX_AI_INSTRUCTION_LENGTH,
  requirementImportDestination,
  requirementImportScopeAction,
  validateRequirementImportScope,
} from '../requirement-import-shared'

const AI_REPAIR_REQUIREMENT_IMPORT_OPERATION =
  'ai.repair-requirement-import-json'
const AI_REPAIR_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES = 1024 * 1024

const repairRequirementImportJsonSchema = aiRequirementImportBaseBodySchema
  .extend({
    errors: z
      .array(z.string().trim().min(1).max(MAX_AI_INSTRUCTION_LENGTH))
      .max(25)
      .optional()
      .default([])
      .transform(errors => [...new Set(errors)]),
    rawJson: z
      .string()
      .trim()
      .min(1)
      .max(MAX_AI_INSTRUCTION_LENGTH * 10),
  })
  .superRefine(validateRequirementImportScope)

type RepairRequirementImportJsonBody = z.infer<
  typeof repairRequirementImportJsonSchema
>

function aiRepairRequestBytesExceededResponse(): NextResponse {
  return NextResponse.json(
    {
      code: 'ai_request_bytes_exceeded',
      details: {
        maxBytes: AI_REPAIR_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES,
      },
      error: 'AI repair request exceeds the allowed size.',
    },
    { status: 413 },
  )
}

export const POST = secureMutationRoute<RepairRequirementImportJsonBody>({
  bodyReader: ({ request }) =>
    readBoundedJsonWithSchema(request, repairRequirementImportJsonSchema, {
      maxBytes: AI_REPAIR_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES,
      requestBytesExceededResponse: aiRepairRequestBytesExceededResponse,
    }),
  policy: requirementsMutationPolicy<RepairRequirementImportJsonBody>(
    ({ body }) => requirementImportScopeAction(body),
  ),
  preParse: ({ context }) => {
    const throttle = checkAiRequirementImportThrottle(
      context,
      AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
    )
    if (!throttle.allowed) {
      return createAiRequirementImportThrottleResponse(
        context,
        AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
        throttle,
      )
    }
  },
  handler: async ({ body, context, db: authorizationDb, request }) => {
    const db = authorizationDb ?? (await getRequestSqlServerDataSource())
    const startedAt = Date.now()

    function recordRepairEvent(
      outcome: 'failure' | 'success',
      statusCode: number,
      stats?: { cost: number; totalTokens: number },
    ) {
      recordCapacityEvent({
        correlationId: context.correlationId,
        durationMs: Date.now() - startedAt,
        event:
          outcome === 'success'
            ? 'capacity.operation.completed'
            : 'capacity.operation.failed',
        metrics: {
          cost: stats?.cost,
          token_count: stats?.totalTokens,
        },
        operation: AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
        outcome,
        requestId: context.requestId,
        source: 'rest',
        statusCode,
      })
    }

    function recordSafetyFilterFailure(error: unknown) {
      logSanitizedError(
        'AI requirement import repair safety filter failed',
        error,
      )
      recordAiSafetyFilterFailure({
        context,
        error,
        operation: AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
        request,
      })
    }

    try {
      const availability = await getAiGenerationAvailability(db)
      if (!availability.effectiveRequirementGenerationEnabled) {
        recordRepairEvent('failure', 503)
        return applyResponseCorrelationHeaders(
          Response.json(
            {
              code: 'ai_provider_unavailable',
              error: AI_PROVIDER_UNAVAILABLE_MESSAGE,
            },
            { status: 503 },
          ),
          context,
        )
      }
    } catch (error) {
      logSanitizedError(
        'AI requirement import repair availability failed',
        error,
      )
      recordRepairEvent('failure', 503)
      return applyResponseCorrelationHeaders(
        Response.json(
          {
            code: 'ai_provider_unavailable',
            error: AI_PROVIDER_UNAVAILABLE_MESSAGE,
          },
          { status: 503 },
        ),
        context,
      )
    }

    const inputGuardResponse = await guardAiInput({
      blockedStep: 'repair_input',
      context,
      db,
      locale: body.locale,
      onBlockedInput: () => recordRepairEvent('failure', 400),
      onSafetyFilterFailure: error => {
        recordSafetyFilterFailure(error)
        recordRepairEvent('failure', 503)
        return applyResponseCorrelationHeaders(
          Response.json(
            {
              code: 'ai_provider_unavailable',
              error: AI_PROVIDER_UNAVAILABLE_MESSAGE,
            },
            { status: 503 },
          ),
          context,
        )
      },
      operation: AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
      parts: [
        { label: 'rawJson', text: body.rawJson },
        ...body.errors.map((error, index) => ({
          label: `errors.${index}`,
          text: error,
        })),
      ],
      request,
    })
    if (inputGuardResponse) return inputGuardResponse

    let modelCapabilities: Awaited<
      ReturnType<typeof resolveOpenRouterModelCapabilities>
    >
    try {
      modelCapabilities = await resolveOpenRouterModelCapabilities(body.model, {
        correlationId: context.correlationId,
        requestId: context.requestId,
      })
    } catch (error) {
      const providerError = normalizeAiProviderError(error, {
        correlationId: context.correlationId,
        operation: 'models.list',
        requestId: context.requestId,
      })
      recordRepairEvent('failure', 503)
      return applyResponseCorrelationHeaders(
        Response.json(aiProviderErrorPayload(providerError), { status: 503 }),
        context,
      )
    }

    let importInstruction: string
    let importBudget: RequirementImportBudget
    try {
      importBudget = requirementImportBudgetFromSettings(
        await getApplicationSettings(db),
      )
      importInstruction = await createRequirementsRuntime(
        db,
      ).service.buildImportInstruction(
        body.locale,
        requirementImportDestination(body),
      )
    } catch (error) {
      logSanitizedError(
        'AI requirement import repair instruction loading failed',
        error,
      )
      recordRepairEvent('failure', 503)
      return applyResponseCorrelationHeaders(
        Response.json(
          {
            code: 'ai_provider_unavailable',
            error: AI_PROVIDER_UNAVAILABLE_MESSAGE,
          },
          { status: 503 },
        ),
        context,
      )
    }

    const systemPrompt = buildRequirementImportSystemPrompt(
      importInstruction,
      body.locale,
    )
    const repairPrompt = buildRequirementImportRepairPrompt({
      brokenJson: body.rawJson,
      errors: body.errors,
      locale: body.locale,
    })
    let result: Awaited<
      ReturnType<typeof generateChat<ImportRequirementsPayload>>
    >
    try {
      result = await generateChat<ImportRequirementsPayload>({
        format: buildRequirementImportResponseFormatSchema(
          body.locale,
          importBudget,
        ),
        messages: [
          { content: systemPrompt, role: 'system' },
          { content: repairPrompt, role: 'user' },
        ],
        model: modelCapabilities.id,
        correlationId: context.correlationId,
        providerPreferences: body.providerPreferences,
        reasoningEffort:
          typeof body.reasoningEffort === 'string'
            ? body.reasoningEffort
            : undefined,
        requestId: context.requestId,
        signal: request.signal,
        supportedParameters: modelCapabilities.supportedParameters,
      })
    } catch (error) {
      if (isAiProviderCallerCancelledError(error)) {
        recordRepairEvent('failure', 499)
        return applyResponseCorrelationHeaders(
          new Response(null, { status: 499 }),
          context,
        )
      }
      const providerError = normalizeAiProviderError(error, {
        correlationId: context.correlationId,
        operation: 'chat.completions',
        requestId: context.requestId,
      })
      recordRepairEvent('failure', 503)
      return applyResponseCorrelationHeaders(
        Response.json(aiProviderErrorPayload(providerError), { status: 503 }),
        context,
      )
    }

    const serializedContent = JSON.stringify(result.content)
    const contentBytes = new TextEncoder().encode(serializedContent).byteLength
    const [budgetIssue] = validateImportContentBudget(
      result.content,
      importBudget,
    )
    if (contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES || budgetIssue) {
      const code =
        contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES
          ? 'import_content_bytes_exceeded'
          : budgetIssue?.code
      const status =
        contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES ? 413 : 422
      recordRepairEvent('failure', status, result.stats)
      return applyResponseCorrelationHeaders(
        Response.json(
          { code, error: 'Generated import exceeds the allowed budget.' },
          { status },
        ),
        context,
      )
    }

    let outputSafetyScreening: Awaited<
      ReturnType<typeof screenAiOutputDetailed>
    >
    try {
      outputSafetyScreening = await screenAiOutputDetailed(db, [
        { label: 'rawContent', text: serializedContent },
        { label: 'thinking', text: result.thinking },
      ])
    } catch (error) {
      recordSafetyFilterFailure(error)
      recordRepairEvent('failure', 503, result.stats)
      return applyResponseCorrelationHeaders(
        Response.json(
          {
            code: 'ai_provider_unavailable',
            error: AI_PROVIDER_UNAVAILABLE_MESSAGE,
          },
          { status: 503 },
        ),
        context,
      )
    }
    if (!outputSafetyScreening.decision.allowed) {
      await recordAiSafetyBlock({
        blockedStep: 'repaired_model_output',
        context,
        db,
        direction: 'output',
        event: 'ai.output_safety.blocked',
        model: modelCapabilities.id,
        operation: AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
        provider: modelCapabilities.provider,
        request,
        screening: outputSafetyScreening,
      })
      recordRepairEvent('failure', 422, result.stats)
      return applyResponseCorrelationHeaders(
        Response.json(
          {
            error: formatAiSafetyBlockedMessage(
              body.locale,
              'outputSafetyBlocked',
              outputSafetyScreening.decision,
            ),
          },
          { status: 422 },
        ),
        context,
      )
    }
    const validation = buildRequirementsImportPayloadSchema(
      importBudget,
    ).safeParse(result.content)
    if (!validation?.success) {
      const providerError = normalizeAiProviderError(null, {
        code: 'ai_provider_invalid_response',
        correlationId: context.correlationId,
        modelProvider: modelCapabilities.provider,
        operation: 'chat.completions',
        requestId: context.requestId,
      })
      recordRepairEvent('failure', 503, result.stats)
      return applyResponseCorrelationHeaders(
        Response.json(aiProviderErrorPayload(providerError), { status: 503 }),
        context,
      )
    }
    recordRepairEvent('success', 200, result.stats)
    return applyResponseCorrelationHeaders(
      Response.json({
        model: modelCapabilities.id,
        payload: validation.data,
        rawContent: serializedContent,
        stats: result.stats,
        thinking: result.thinking,
      }),
      context,
    )
  },
})
