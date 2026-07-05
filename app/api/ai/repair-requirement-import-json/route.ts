import { z } from 'zod'
import { generateChat } from '@/lib/ai/openrouter-client'
import { resolveOpenRouterModelCapabilities } from '@/lib/ai/openrouter-model-catalog'
import {
  buildRequirementImportRepairPrompt,
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
  formatSchemaIssues,
  getPromptMessage,
} from '@/lib/ai/requirement-prompt'
import {
  recordAiSafetyBlock,
  recordAiSafetyFilterFailure,
  screenAiInputDetailed,
  screenAiOutputDetailed,
} from '@/lib/ai/safety'
import { getAiGenerationAvailability } from '@/lib/dal/ai-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  AI_PROVIDER_UNAVAILABLE_MESSAGE,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import {
  type ImportRequirementsPayload,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import {
  aiRequirementImportBaseBodySchema,
  checkAiRequirementImportThrottle,
  createAiRequirementImportThrottleResponse,
  formatAiSafetyBlockedMessage,
  MAX_AI_INSTRUCTION_LENGTH,
  requirementImportScopeAction,
  validateRequirementImportScope,
} from '../requirement-import-shared'

const AI_REPAIR_REQUIREMENT_IMPORT_OPERATION =
  'ai.repair-requirement-import-json'

const repairRequirementImportJsonSchema = aiRequirementImportBaseBodySchema
  .extend({
    errors: z
      .array(z.string().trim().min(1).max(MAX_AI_INSTRUCTION_LENGTH))
      .max(25)
      .optional()
      .default([]),
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

export const POST = secureMutationRoute({
  bodySchema: repairRequirementImportJsonSchema,
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
            { error: AI_PROVIDER_UNAVAILABLE_MESSAGE },
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
          { error: AI_PROVIDER_UNAVAILABLE_MESSAGE },
          { status: 503 },
        ),
        context,
      )
    }

    let inputSafetyScreening: Awaited<ReturnType<typeof screenAiInputDetailed>>
    try {
      inputSafetyScreening = await screenAiInputDetailed(db, [
        { label: 'rawJson', text: body.rawJson },
        ...body.errors.map((error, index) => ({
          label: `errors.${index}`,
          text: error,
        })),
      ])
    } catch (error) {
      recordSafetyFilterFailure(error)
      recordRepairEvent('failure', 503)
      return applyResponseCorrelationHeaders(
        Response.json(
          { error: AI_PROVIDER_UNAVAILABLE_MESSAGE },
          { status: 503 },
        ),
        context,
      )
    }
    if (!inputSafetyScreening.decision.allowed) {
      await recordAiSafetyBlock({
        blockedStep: 'repair_input',
        context,
        db,
        direction: 'input',
        event: 'ai.input_safety.blocked',
        operation: AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
        request,
        screening: inputSafetyScreening,
      })
      recordRepairEvent('failure', 400)
      return applyResponseCorrelationHeaders(
        Response.json(
          {
            error: formatAiSafetyBlockedMessage(
              body.locale,
              'inputSafetyBlocked',
              inputSafetyScreening.decision,
            ),
          },
          { status: 400 },
        ),
        context,
      )
    }

    try {
      const modelCapabilities = await resolveOpenRouterModelCapabilities(
        body.model,
      )
      const importInstruction = await createRequirementsRuntime(
        db,
      ).service.buildImportInstruction(body.locale)
      const systemPrompt = buildRequirementImportSystemPrompt(
        importInstruction,
        body.locale,
      )
      const repairPrompt = buildRequirementImportRepairPrompt({
        brokenJson: body.rawJson,
        errors: body.errors,
        locale: body.locale,
      })
      const result = await generateChat<ImportRequirementsPayload>({
        format: buildRequirementImportResponseFormatSchema(body.locale),
        messages: [
          { content: systemPrompt, role: 'system' },
          { content: repairPrompt, role: 'user' },
        ],
        model: modelCapabilities.id,
        providerPreferences: body.providerPreferences,
        reasoningEffort:
          typeof body.reasoningEffort === 'string'
            ? body.reasoningEffort
            : undefined,
        signal: request.signal,
        supportedParameters: modelCapabilities.supportedParameters,
      })
      let outputSafetyScreening: Awaited<
        ReturnType<typeof screenAiOutputDetailed>
      >
      try {
        outputSafetyScreening = await screenAiOutputDetailed(db, [
          { label: 'rawContent', text: JSON.stringify(result.content) },
          { label: 'thinking', text: result.thinking },
        ])
      } catch (error) {
        recordSafetyFilterFailure(error)
        recordRepairEvent('failure', 503, result.stats)
        return applyResponseCorrelationHeaders(
          Response.json(
            { error: AI_PROVIDER_UNAVAILABLE_MESSAGE },
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
      const validation = requirementsImportPayloadSchema.safeParse(
        result.content,
      )
      if (!validation.success) {
        const issues = formatSchemaIssues(validation.error)
        logSanitizedError(
          'AI requirement import repair validation failed',
          new Error('Repaired import JSON failed validation'),
          {
            issueCount: issues.length,
            issues: issues.map(issue => ({
              code: issue.code,
              path: issue.path,
            })),
          },
        )
        recordRepairEvent('failure', 422, result.stats)
        return applyResponseCorrelationHeaders(
          Response.json(
            {
              error: getPromptMessage(body.locale, [
                'ai',
                'repairedJsonSchemaMismatch',
              ]),
              issues,
            },
            { status: 422 },
          ),
          context,
        )
      }

      recordRepairEvent('success', 200, result.stats)
      return applyResponseCorrelationHeaders(
        Response.json({
          model: modelCapabilities.id,
          payload: validation.data,
          rawContent: JSON.stringify(validation.data),
          stats: result.stats,
          thinking: result.thinking,
        }),
        context,
      )
    } catch (error) {
      logSanitizedError('AI requirement import repair failed', error)
      recordRepairEvent('failure', 503)
      return applyResponseCorrelationHeaders(
        Response.json(
          { error: AI_PROVIDER_UNAVAILABLE_MESSAGE },
          { status: 503 },
        ),
        context,
      )
    }
  },
})
