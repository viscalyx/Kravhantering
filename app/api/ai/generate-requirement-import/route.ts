import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AiAuthoringRuntime,
  createProductionAiAuthoringRuntime,
} from '@/lib/ai/authoring-runtime'
import {
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
  getPromptMessage,
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
import {
  applyResponseCorrelationHeaders,
  type RequestCorrelationIds,
} from '@/lib/observability/request-ids'
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
  AI_GENERATE_SLOW_THRESHOLD_MS,
  AI_RUN_REQUEST_DEADLINE_MS,
  aiRequirementImportBaseBodySchema,
  aiRunFailureError,
  aiRunProfileError,
  aiUsageMetricValue,
  checkAiRequirementImportThrottle,
  countImageBytes,
  createAiRequirementImportThrottleResponse,
  createUnavailableAiStreamResponse,
  guardAiInput,
  imageDataUrlSchema,
  MAX_AI_IMAGES,
  MAX_AI_NEED_LENGTH,
  requirementCandidateCountSchema,
  requirementImportDestination,
  requirementImportScopeAction,
  toAiTaskContent,
  validateRequirementImportImages,
  validateRequirementImportScope,
} from '../requirement-import-shared'

const AI_GENERATE_REQUIREMENT_IMPORT_OPERATION =
  'ai.generate-requirement-import'
export const AI_GENERATE_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES = 42 * 1024 * 1024

const generateRequirementImportSchema = aiRequirementImportBaseBodySchema
  .extend({
    count: requirementCandidateCountSchema,
    images: z
      .array(z.object({ dataUrl: imageDataUrlSchema }).strict())
      .max(MAX_AI_IMAGES)
      .optional()
      .default([]),
    need: z.string().trim().min(1).max(MAX_AI_NEED_LENGTH),
  })
  .superRefine((body, context) => {
    validateRequirementImportImages(body, context)
    validateRequirementImportScope(body, context)
  })

type GenerateRequirementImportBody = z.infer<
  typeof generateRequirementImportSchema
>

function aiRequestBytesExceededResponse(): NextResponse {
  return NextResponse.json(
    {
      code: 'ai_request_bytes_exceeded',
      details: { maxBytes: AI_GENERATE_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES },
      error: 'AI generation request exceeds the allowed size.',
    },
    { status: 413 },
  )
}

function createStreamRecorder(
  context: RequestCorrelationIds,
  imageBytes: number,
  imageCount: number,
  startedAt: number,
) {
  let recorded = false
  return (
    outcome: 'failure' | 'success',
    statusCode: number,
    usage?: AiRunUsage,
  ): void => {
    if (recorded) return
    recorded = true
    const durationMs = Date.now() - startedAt
    const event = {
      correlationId: context.correlationId,
      durationMs,
      metrics: {
        image_bytes: imageBytes,
        image_count: imageCount,
        token_count: usage ? aiUsageMetricValue(usage.totalTokens) : null,
      },
      operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
      outcome,
      requestId: context.requestId,
      source: 'rest' as const,
      statusCode,
    }
    recordCapacityEvent({
      ...event,
      event:
        outcome === 'success'
          ? 'capacity.operation.completed'
          : 'capacity.operation.failed',
    })
    if (durationMs >= AI_GENERATE_SLOW_THRESHOLD_MS) {
      recordCapacityEvent({
        ...event,
        event: 'capacity.threshold_exceeded',
        level: 'warn',
      })
    }
  }
}

function validatePayload(
  rawContent: string,
  budget: RequirementImportBudget,
):
  | { ok: true; payload: ImportRequirementsPayload }
  | { code: string; ok: false; status: 413 | 422 | 503 } {
  if (
    new TextEncoder().encode(rawContent).byteLength >
    REQUIREMENT_IMPORT_CONTENT_MAX_BYTES
  ) {
    return { code: 'import_content_bytes_exceeded', ok: false, status: 413 }
  }
  let parsed: unknown
  try {
    parsed = parseJsonObject(rawContent)
  } catch {
    return { code: 'ai_provider_invalid_response', ok: false, status: 503 }
  }
  const [budgetIssue] = validateImportContentBudget(parsed, budget)
  if (budgetIssue) return { code: budgetIssue.code, ok: false, status: 422 }
  const validation =
    buildRequirementsImportPayloadSchema(budget).safeParse(parsed)
  return validation.success
    ? { ok: true, payload: validation.data }
    : { code: 'ai_provider_invalid_response', ok: false, status: 503 }
}

export const POST = secureMutationRoute<GenerateRequirementImportBody>({
  bodyReader: ({ request }) =>
    readBoundedJsonWithSchema(request, generateRequirementImportSchema, {
      maxBytes: AI_GENERATE_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES,
      requestBytesExceededResponse: aiRequestBytesExceededResponse,
    }),
  policy: requirementsMutationPolicy<GenerateRequirementImportBody>(
    ({ body }) => requirementImportScopeAction(body),
  ),
  preParse: ({ context }) => {
    const throttle = checkAiRequirementImportThrottle(
      context,
      AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
    )
    if (!throttle.allowed) {
      return createAiRequirementImportThrottleResponse(
        context,
        AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
        throttle,
      )
    }
  },
  handler: async ({ body, context, db: authorizationDb, request }) => {
    const db = authorizationDb ?? (await getRequestSqlServerDataSource())
    const recordTerminal = createStreamRecorder(
      context,
      countImageBytes(body.images),
      body.images.length,
      Date.now(),
    )
    try {
      const availability = await getAiGenerationAvailability(db)
      if (!availability.effectiveRequirementGenerationEnabled) {
        return createUnavailableAiStreamResponse(context, () =>
          recordTerminal('failure', 503),
        )
      }
    } catch (error) {
      logSanitizedError('AI requirement import availability failed', error)
      return createUnavailableAiStreamResponse(context, () =>
        recordTerminal('failure', 503),
      )
    }

    const inputGuardResponse = await guardAiInput({
      blockedStep: 'ai_request_input',
      context,
      db,
      locale: body.locale,
      onBlockedInput: () => recordTerminal('failure', 400),
      onSafetyFilterFailure: error => {
        logSanitizedError('AI requirement import safety filter failed', error)
        return createUnavailableAiStreamResponse(context, () =>
          recordTerminal('failure', 503),
        )
      },
      operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
      parts: [{ label: 'need', text: body.need }],
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
      logSanitizedError('AI requirement import instruction failed', error)
      return createUnavailableAiStreamResponse(context, () =>
        recordTerminal('failure', 503),
      )
    }

    let runtime: AiAuthoringRuntime
    try {
      runtime = createProductionAiAuthoringRuntime(db)
    } catch (error) {
      logSanitizedError('AI authoring runtime unavailable', error)
      return createUnavailableAiStreamResponse(context, () =>
        recordTerminal('failure', 503),
      )
    }
    const applicationRunId = randomUUID()
    const run = runtime.run({
      context: {
        abortSignal: request.signal,
        applicationRunId,
        correlationId: context.correlationId,
        deadlineAt: new Date(
          Date.now() + AI_RUN_REQUEST_DEADLINE_MS,
        ).toISOString(),
        requestId: context.requestId,
      },
      task: {
        content: toAiTaskContent(
          buildRequirementImportUserPrompt({
            count: Math.min(body.count, importBudget.maxRows),
            locale: body.locale,
            need: body.need,
          }),
          body.images,
        ),
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
      type:
        body.images.length > 0
          ? 'generate_with_images'
          : 'generate_without_images',
    })

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (event: string, data: unknown): void => {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          )
        }
        try {
          let terminal = false
          let sentProgress = false
          for await (const event of run) {
            if (event.type === 'heartbeat') {
              if (!sentProgress) send('generating', { chunk: '' })
              sentProgress = true
              continue
            }
            if (event.type === 'completed') {
              const validation = validatePayload(event.rawOutput, importBudget)
              if (!validation.ok) {
                send('error', {
                  code: validation.code,
                  message: validation.code.startsWith('import_')
                    ? 'Generated import exceeds the allowed budget.'
                    : AI_PROVIDER_UNAVAILABLE_MESSAGE,
                })
                recordTerminal('failure', validation.status, event.usage)
              } else {
                const rawContent = JSON.stringify(validation.payload)
                send('done', {
                  payload: validation.payload,
                  rawContent,
                  stats: {
                    totalTokens: aiUsageMetricValue(event.usage.totalTokens),
                  },
                  thinking: event.analysis ?? '',
                })
                recordTerminal('success', 200, event.usage)
              }
              terminal = true
              break
            }
            if (event.type === 'invalid_output') {
              send('validation_error', {
                issues: event.issues,
                message: getPromptMessage(body.locale, [
                  'ai',
                  'validationErrors',
                ]),
                rawContent: event.rawOutput,
                stats: {
                  totalTokens: aiUsageMetricValue(event.usage.totalTokens),
                },
                thinking: event.analysis ?? '',
              })
              recordTerminal('failure', 422, event.usage)
              terminal = true
              break
            }
            if (event.type === 'failed') {
              send('error', aiRunFailureError(event.failure, body.locale))
              recordTerminal(
                'failure',
                event.failure.category === 'rate_limited' ? 429 : 503,
              )
              terminal = true
              break
            }
            if (event.type === 'cancelled') {
              if (!request.signal.aborted) {
                send('error', {
                  code: 'ai_provider_unavailable',
                  message: AI_PROVIDER_UNAVAILABLE_MESSAGE,
                })
              }
              recordTerminal('failure', 499)
              terminal = true
              break
            }
          }
          if (!terminal && !request.signal.aborted) {
            send('error', {
              code: 'ai_provider_unavailable',
              message: AI_PROVIDER_UNAVAILABLE_MESSAGE,
            })
            recordTerminal('failure', 503)
          }
        } catch (error) {
          const profileError = aiRunProfileError(error, body.locale)
          if (!request.signal.aborted) {
            send('error', {
              code: profileError?.code ?? 'ai_provider_unavailable',
              message: profileError?.message ?? AI_PROVIDER_UNAVAILABLE_MESSAGE,
            })
          }
          if (!profileError) {
            logSanitizedError('AI requirement import run failed', error)
          }
          recordTerminal('failure', request.signal.aborted ? 499 : 503)
        } finally {
          controller.close()
        }
      },
    })

    return applyResponseCorrelationHeaders(
      new Response(stream, {
        headers: {
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream',
        },
      }),
      context,
    )
  },
})
