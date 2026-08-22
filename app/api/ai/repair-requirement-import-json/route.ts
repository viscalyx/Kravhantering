import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AiAuthoringRuntime,
  createProductionAiAuthoringRuntime,
} from '@/lib/ai/authoring-runtime'
import {
  buildRequirementImportRepairPrompt,
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
  parseJsonObject,
} from '@/lib/ai/requirement-prompt'
import type { AiRunUsage } from '@/lib/ai/run-contracts'
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
  buildRequirementsImportJsonSchema,
  buildRequirementsImportPayloadSchema,
  type ImportRequirementsPayload,
} from '@/lib/requirements/import-schema'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import {
  AI_RUN_REQUEST_DEADLINE_MS,
  aiRequirementImportBaseBodySchema,
  aiRunFailureError,
  aiRunProfileError,
  aiUsageMetricValue,
  checkAiRequirementImportThrottle,
  createAiRequirementImportThrottleResponse,
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
      details: { maxBytes: AI_REPAIR_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES },
      error: 'AI repair request exceeds the allowed size.',
    },
    { status: 413 },
  )
}

function unavailable(
  context: Parameters<typeof applyResponseCorrelationHeaders>[1],
) {
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
    const recordTerminal = (
      outcome: 'failure' | 'success',
      statusCode: number,
      usage?: AiRunUsage,
    ): void => {
      recordCapacityEvent({
        correlationId: context.correlationId,
        durationMs: Date.now() - startedAt,
        event:
          outcome === 'success'
            ? 'capacity.operation.completed'
            : 'capacity.operation.failed',
        metrics: {
          token_count: usage ? aiUsageMetricValue(usage.totalTokens) : null,
        },
        operation: AI_REPAIR_REQUIREMENT_IMPORT_OPERATION,
        outcome,
        requestId: context.requestId,
        source: 'rest',
        statusCode,
      })
    }

    try {
      const availability = await getAiGenerationAvailability(db)
      if (!availability.effectiveRequirementGenerationEnabled) {
        recordTerminal('failure', 503)
        return unavailable(context)
      }
    } catch (error) {
      logSanitizedError(
        'AI requirement import repair availability failed',
        error,
      )
      recordTerminal('failure', 503)
      return unavailable(context)
    }

    const inputGuardResponse = await guardAiInput({
      blockedStep: 'repair_input',
      context,
      db,
      locale: body.locale,
      onBlockedInput: () => recordTerminal('failure', 400),
      onSafetyFilterFailure: error => {
        logSanitizedError('AI requirement import repair safety failed', error)
        recordTerminal('failure', 503)
        return unavailable(context)
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

    let importBudget: RequirementImportBudget
    let importInstruction: string
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
        'AI requirement import repair instruction failed',
        error,
      )
      recordTerminal('failure', 503)
      return unavailable(context)
    }

    let runtime: AiAuthoringRuntime
    try {
      runtime = createProductionAiAuthoringRuntime(db)
    } catch (error) {
      logSanitizedError('AI authoring runtime unavailable', error)
      recordTerminal('failure', 503)
      return unavailable(context)
    }
    const run = runtime.run({
      context: {
        abortSignal: request.signal,
        applicationRunId: randomUUID(),
        correlationId: context.correlationId,
        deadlineAt: new Date(
          Date.now() + AI_RUN_REQUEST_DEADLINE_MS,
        ).toISOString(),
        requestId: context.requestId,
      },
      task: {
        content: [
          {
            text: buildRequirementImportRepairPrompt({
              brokenJson: body.rawJson,
              errors: body.errors,
              locale: body.locale,
            }),
            type: 'text',
          },
        ],
        instructions: buildRequirementImportSystemPrompt(
          importInstruction,
          body.locale,
        ),
        responseSchema: buildRequirementImportResponseFormatSchema(
          body.locale,
          importBudget,
        ),
        validationSchema: buildRequirementsImportJsonSchema(
          body.locale,
          importBudget,
        ),
      },
      type: 'repair_invalid_import_json',
    })

    try {
      for await (const event of run) {
        if (event.type === 'completed') {
          const contentBytes = new TextEncoder().encode(
            event.rawOutput,
          ).byteLength
          let parsed: unknown
          try {
            parsed = parseJsonObject(event.rawOutput)
          } catch {
            recordTerminal('failure', 503, event.usage)
            return unavailable(context)
          }
          const [budgetIssue] = validateImportContentBudget(
            parsed,
            importBudget,
          )
          if (
            contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES ||
            budgetIssue
          ) {
            const status =
              contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES ? 413 : 422
            recordTerminal('failure', status, event.usage)
            return applyResponseCorrelationHeaders(
              Response.json(
                {
                  code:
                    contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES
                      ? 'import_content_bytes_exceeded'
                      : budgetIssue?.code,
                  error: 'Generated import exceeds the allowed budget.',
                },
                { status },
              ),
              context,
            )
          }
          const validation =
            buildRequirementsImportPayloadSchema(importBudget).safeParse(parsed)
          if (!validation.success) {
            recordTerminal('failure', 503, event.usage)
            return unavailable(context)
          }
          const payload: ImportRequirementsPayload = validation.data
          const rawContent = JSON.stringify(payload)
          recordTerminal('success', 200, event.usage)
          return applyResponseCorrelationHeaders(
            Response.json({
              payload,
              rawContent,
              stats: {
                totalTokens: aiUsageMetricValue(event.usage.totalTokens),
              },
              thinking: event.analysis ?? '',
            }),
            context,
          )
        }
        if (event.type === 'failed') {
          const status = event.failure.category === 'rate_limited' ? 429 : 503
          const providerError = aiRunFailureError(event.failure, body.locale)
          const retryAfterSeconds = event.failure.retryAfterSeconds
          recordTerminal('failure', status)
          return applyResponseCorrelationHeaders(
            Response.json(
              {
                code: providerError.code,
                error: providerError.message,
                ...(providerError.technicalCode
                  ? { technicalCode: providerError.technicalCode }
                  : {}),
              },
              {
                ...(status === 429 && retryAfterSeconds !== undefined
                  ? {
                      headers: {
                        'Retry-After': String(retryAfterSeconds),
                      },
                    }
                  : {}),
                status,
              },
            ),
            context,
          )
        }
        if (event.type === 'cancelled') {
          recordTerminal('failure', 499)
          return applyResponseCorrelationHeaders(
            new Response(null, { status: 499 }),
            context,
          )
        }
      }
    } catch (error) {
      const profileError = aiRunProfileError(error, body.locale)
      if (profileError) {
        recordTerminal('failure', 503)
        return applyResponseCorrelationHeaders(
          Response.json(
            { code: profileError.code, error: profileError.message },
            { status: 503 },
          ),
          context,
        )
      }
      logSanitizedError('AI requirement import repair run failed', error)
    }
    recordTerminal('failure', request.signal.aborted ? 499 : 503)
    return request.signal.aborted
      ? applyResponseCorrelationHeaders(
          new Response(null, { status: 499 }),
          context,
        )
      : unavailable(context)
  },
})
