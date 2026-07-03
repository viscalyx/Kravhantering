import { z } from 'zod'
import {
  type GenerationStats,
  generateChatStream,
} from '@/lib/ai/openrouter-client'
import { resolveOpenRouterModelCapabilities } from '@/lib/ai/openrouter-model-catalog'
import {
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
  formatSchemaIssues,
  getPromptMessage,
  parseJsonObject,
} from '@/lib/ai/requirement-prompt'
import {
  recordAiSafetyDecision,
  recordAiSafetyFilterFailure,
  screenAiInput,
  screenAiOutput,
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
import {
  applyResponseCorrelationHeaders,
  type RequestCorrelationIds,
} from '@/lib/observability/request-ids'
import {
  type ImportRequirementsPayload,
  requirementsImportPayloadSchema,
} from '@/lib/requirements/import-schema'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import {
  AI_GENERATE_SLOW_THRESHOLD_MS,
  aiRequirementImportBaseBodySchema,
  checkAiRequirementImportThrottle,
  countImageBytes,
  createAiRequirementImportThrottleResponse,
  createUnavailableAiStreamResponse,
  imageDataUrlSchema,
  MAX_AI_IMAGES,
  MAX_AI_NEED_LENGTH,
  requirementCandidateCountSchema,
  requirementImportScopeAction,
  validateRequirementImportImages,
  validateRequirementImportScope,
  withImages,
} from '../requirement-import-shared'

const AI_GENERATE_REQUIREMENT_IMPORT_OPERATION =
  'ai.generate-requirement-import'

const generateRequirementImportSchema = aiRequirementImportBaseBodySchema
  .extend({
    count: requirementCandidateCountSchema,
    images: z
      .array(
        z
          .object({
            dataUrl: imageDataUrlSchema,
          })
          .strict(),
      )
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

function createStreamRecorder(
  context: RequestCorrelationIds,
  imageBytes: number,
  imageCount: number,
  streamStartedAt: number,
) {
  let recordedTerminalEvent = false

  return (
    outcome: 'failure' | 'success',
    statusCode: number,
    stats?: GenerationStats,
  ) => {
    if (recordedTerminalEvent) return
    recordedTerminalEvent = true
    const durationMs = Date.now() - streamStartedAt
    recordCapacityEvent({
      correlationId: context.correlationId,
      durationMs,
      event:
        outcome === 'success'
          ? 'capacity.operation.completed'
          : 'capacity.operation.failed',
      metrics: {
        cost: stats?.cost,
        image_bytes: imageBytes,
        image_count: imageCount,
        token_count: stats?.totalTokens,
      },
      operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
      outcome,
      requestId: context.requestId,
      source: 'rest',
      statusCode,
    })
    if (durationMs >= AI_GENERATE_SLOW_THRESHOLD_MS) {
      recordCapacityEvent({
        correlationId: context.correlationId,
        durationMs,
        event: 'capacity.threshold_exceeded',
        level: 'warn',
        metrics: {
          image_bytes: imageBytes,
          image_count: imageCount,
          token_count: stats?.totalTokens,
        },
        operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
        outcome,
        requestId: context.requestId,
        source: 'rest',
        statusCode,
      })
    }
  }
}

function parseAndValidatePayload(
  rawContent: string,
  locale: 'en' | 'sv',
): {
  issues?: ReturnType<typeof formatSchemaIssues>
  payload?: ImportRequirementsPayload
} {
  let parsed: unknown
  try {
    parsed = parseJsonObject(rawContent)
  } catch {
    return {
      issues: [
        {
          code: 'invalid_json',
          message: getPromptMessage(locale, ['ai', 'invalidGeneratedJson']),
          path: '$',
        },
      ],
    }
  }

  const validation = requirementsImportPayloadSchema.safeParse(parsed)
  if (!validation.success) {
    return { issues: formatSchemaIssues(validation.error) }
  }

  return { payload: validation.data }
}

function imageMetadataForSafety(
  images: GenerateRequirementImportBody['images'],
): readonly string[] {
  return images.map((image, index) => {
    const commaIndex = image.dataUrl.indexOf(',')
    const header =
      commaIndex >= 0 ? image.dataUrl.slice(0, commaIndex) : 'data-url'
    return `image ${index + 1}: ${header}`
  })
}

export const POST = secureMutationRoute({
  bodySchema: generateRequirementImportSchema,
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
    const { images, locale } = body
    const imageBytes = countImageBytes(images)
    const db = authorizationDb ?? (await getRequestSqlServerDataSource())
    const streamStartedAt = Date.now()
    const recordStreamEvent = createStreamRecorder(
      context,
      imageBytes,
      images.length,
      streamStartedAt,
    )

    function recordSafetyFilterFailure(error: unknown) {
      logSanitizedError('AI requirement import safety filter failed', error)
      recordAiSafetyFilterFailure({
        context,
        error,
        operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
        request,
      })
    }

    try {
      const availability = await getAiGenerationAvailability(db)
      if (!availability.effectiveRequirementGenerationEnabled) {
        return createUnavailableAiStreamResponse(context, () =>
          recordStreamEvent('failure', 503),
        )
      }
    } catch (error) {
      logSanitizedError('AI requirement import availability failed', error)
      return createUnavailableAiStreamResponse(context, () =>
        recordStreamEvent('failure', 503),
      )
    }

    let inputSafetyDecision: ReturnType<typeof screenAiInput>
    try {
      inputSafetyDecision = screenAiInput([
        body.need,
        ...imageMetadataForSafety(images),
      ])
    } catch (error) {
      recordSafetyFilterFailure(error)
      return createUnavailableAiStreamResponse(context, () =>
        recordStreamEvent('failure', 503),
      )
    }
    if (!inputSafetyDecision.allowed) {
      recordAiSafetyDecision({
        context,
        decision: inputSafetyDecision,
        event: 'ai.input_safety.blocked',
        operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
        request,
      })
      recordStreamEvent('failure', 400)
      return applyResponseCorrelationHeaders(
        Response.json(
          {
            error: getPromptMessage(locale, ['ai', 'inputSafetyBlocked']),
          },
          { status: 400 },
        ),
        context,
      )
    }

    let importInstruction: string
    try {
      importInstruction =
        await createRequirementsRuntime(db).service.buildImportAiPrompt(locale)
    } catch (error) {
      logSanitizedError('AI requirement import prompt loading failed', error)
      return createUnavailableAiStreamResponse(context, () =>
        recordStreamEvent('failure', 503),
      )
    }
    const systemPrompt = buildRequirementImportSystemPrompt(
      importInstruction,
      locale,
    )
    const userPrompt = buildRequirementImportUserPrompt({
      count: body.count,
      locale,
      need: body.need,
    })
    const userContent = withImages(userPrompt, images)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        function send(event: string, data: unknown) {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          )
        }

        try {
          const modelCapabilities = await resolveOpenRouterModelCapabilities(
            body.model,
          )
          const resolvedModel = modelCapabilities.id
          let sentGeneratingProgress = false
          for await (const event of generateChatStream({
            format: buildRequirementImportResponseFormatSchema(locale),
            messages: [
              { content: systemPrompt, role: 'system' },
              { content: userContent, role: 'user' },
            ],
            model: resolvedModel,
            providerPreferences: body.providerPreferences,
            reasoningEffort:
              typeof body.reasoningEffort === 'string'
                ? body.reasoningEffort
                : undefined,
            signal: request.signal,
            supportedParameters: modelCapabilities.supportedParameters,
          })) {
            switch (event.phase) {
              case 'thinking': {
                let progressSafetyDecision: ReturnType<typeof screenAiOutput>
                try {
                  progressSafetyDecision = screenAiOutput([
                    event.thinkingSoFar || event.chunk,
                  ])
                } catch (error) {
                  recordSafetyFilterFailure(error)
                  send('error', { message: AI_PROVIDER_UNAVAILABLE_MESSAGE })
                  recordStreamEvent('failure', 503)
                  return
                }
                if (!progressSafetyDecision.allowed) {
                  recordAiSafetyDecision({
                    context,
                    decision: progressSafetyDecision,
                    event: 'ai.output_safety.blocked',
                    model: resolvedModel,
                    operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
                    provider: modelCapabilities.provider,
                    request,
                  })
                  send('error', {
                    message: getPromptMessage(body.locale, [
                      'ai',
                      'outputSafetyBlocked',
                    ]),
                    model: resolvedModel,
                  })
                  recordStreamEvent('failure', 422)
                  return
                }
                send('thinking', { thinkingSoFar: event.thinkingSoFar })
                break
              }
              case 'generating':
                if (!sentGeneratingProgress) {
                  sentGeneratingProgress = true
                  send('generating', { chunk: '' })
                }
                break
              case 'done': {
                let outputSafetyDecision: ReturnType<typeof screenAiOutput>
                try {
                  outputSafetyDecision = screenAiOutput([
                    event.rawContent,
                    event.thinking,
                  ])
                } catch (error) {
                  recordSafetyFilterFailure(error)
                  send('error', { message: AI_PROVIDER_UNAVAILABLE_MESSAGE })
                  recordStreamEvent('failure', 503, event.stats)
                  return
                }
                if (!outputSafetyDecision.allowed) {
                  recordAiSafetyDecision({
                    context,
                    decision: outputSafetyDecision,
                    event: 'ai.output_safety.blocked',
                    model: resolvedModel,
                    operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
                    provider: modelCapabilities.provider,
                    request,
                  })
                  send('error', {
                    message: getPromptMessage(body.locale, [
                      'ai',
                      'outputSafetyBlocked',
                    ]),
                    model: resolvedModel,
                    stats: event.stats,
                  })
                  recordStreamEvent('failure', 422, event.stats)
                  return
                }

                const validation = parseAndValidatePayload(
                  event.rawContent,
                  body.locale,
                )
                if (!validation.payload) {
                  logSanitizedError(
                    'AI requirement import output validation failed',
                    new Error('Generated import JSON failed validation'),
                    {
                      issueCount: validation.issues?.length ?? 0,
                      issues: validation.issues?.map(issue => ({
                        code: issue.code,
                        path: issue.path,
                      })),
                    },
                  )
                  send('validation_error', {
                    issues: validation.issues ?? [],
                    message: getPromptMessage(body.locale, [
                      'ai',
                      'generatedJsonSchemaMismatch',
                    ]),
                    model: resolvedModel,
                    rawContent: event.rawContent,
                    stats: event.stats,
                    thinking: event.thinking,
                  })
                  recordStreamEvent('failure', 422, event.stats)
                  return
                }

                const rawContent = JSON.stringify(validation.payload)
                send('done', {
                  model: resolvedModel,
                  payload: validation.payload,
                  rawContent,
                  stats: event.stats,
                  thinking: event.thinking,
                })
                recordStreamEvent('success', 200, event.stats)
                return
              }
              case 'error':
                logSanitizedError(
                  'AI requirement import stream failed',
                  event.cause ?? event.message,
                )
                send('error', { message: AI_PROVIDER_UNAVAILABLE_MESSAGE })
                recordStreamEvent('failure', 503)
                return
            }
          }
        } catch (error) {
          logSanitizedError('AI requirement import generation failed', error)
          send('error', { message: AI_PROVIDER_UNAVAILABLE_MESSAGE })
          recordStreamEvent('failure', 503)
        } finally {
          controller.close()
        }
      },
    })

    return applyResponseCorrelationHeaders(
      new Response(stream, {
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream',
        },
      }),
      context,
    )
  },
})
