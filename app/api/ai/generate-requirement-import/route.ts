import { z } from 'zod'
import {
  type GenerationStats,
  generateChatStream,
  type StreamEvent,
} from '@/lib/ai/openrouter-client'
import { resolveOpenRouterModelCapabilities } from '@/lib/ai/openrouter-model-catalog'
import {
  aiProviderStreamError,
  normalizeAiProviderError,
} from '@/lib/ai/provider-errors'
import {
  buildRequirementImportResponseFormatSchema,
  buildRequirementImportSystemPrompt,
  buildRequirementImportUserPrompt,
  parseJsonObject,
} from '@/lib/ai/requirement-prompt'
import {
  type AiSafetyScreenPart,
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
  buildRequirementsImportPayloadSchema,
  type ImportRequirementsPayload,
} from '@/lib/requirements/import-schema'
import { createRequirementsRuntime } from '@/lib/requirements/server'
import {
  AI_GENERATE_SLOW_THRESHOLD_MS,
  aiRequirementImportBaseBodySchema,
  checkAiRequirementImportThrottle,
  countImageBytes,
  createAiErrorStreamResponse,
  createAiRequirementImportThrottleResponse,
  createUnavailableAiStreamResponse,
  formatAiSafetyBlockedMessage,
  guardAiInput,
  imageDataUrlSchema,
  MAX_AI_IMAGES,
  MAX_AI_NEED_LENGTH,
  requirementCandidateCountSchema,
  requirementImportDestination,
  requirementImportScopeAction,
  validateRequirementImportImages,
  validateRequirementImportScope,
  withImages,
} from '../requirement-import-shared'

const AI_GENERATE_REQUIREMENT_IMPORT_OPERATION =
  'ai.generate-requirement-import'
const STREAMED_REASONING_SAFETY_CONTEXT_CHARS = 1000

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
  budget: RequirementImportBudget,
):
  | { ok: true; payload: ImportRequirementsPayload }
  | { code: string; ok: false; status: 413 | 422 | 503 } {
  if (
    new TextEncoder().encode(rawContent).byteLength >
    REQUIREMENT_IMPORT_CONTENT_MAX_BYTES
  ) {
    return {
      code: 'import_content_bytes_exceeded',
      ok: false,
      status: 413,
    }
  }
  let parsed: unknown
  try {
    parsed = parseJsonObject(rawContent)
  } catch {
    return { code: 'ai_provider_invalid_response', ok: false, status: 503 }
  }

  const [budgetIssue] = validateImportContentBudget(parsed, budget)
  if (budgetIssue) {
    return { code: budgetIssue.code, ok: false, status: 422 }
  }
  const validation =
    buildRequirementsImportPayloadSchema(budget).safeParse(parsed)
  return validation.success
    ? { ok: true, payload: validation.data }
    : { code: 'ai_provider_invalid_response', ok: false, status: 503 }
}

function imageMetadataForSafety(
  images: GenerateRequirementImportBody['images'],
): readonly AiSafetyScreenPart[] {
  return images.map((image, index) => {
    const commaIndex = image.dataUrl.indexOf(',')
    const header =
      commaIndex >= 0 ? image.dataUrl.slice(0, commaIndex) : 'data-url'
    return {
      label: `images.${index}.metadata`,
      text: `image ${index + 1}: ${header}`,
    }
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

    const inputGuardResponse = await guardAiInput({
      blockedStep: 'ai_request_input',
      context,
      db,
      locale,
      onBlockedInput: () => recordStreamEvent('failure', 400),
      onSafetyFilterFailure: error => {
        recordSafetyFilterFailure(error)
        return createUnavailableAiStreamResponse(context, () =>
          recordStreamEvent('failure', 503),
        )
      },
      operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
      parts: [
        { label: 'need', text: body.need },
        ...imageMetadataForSafety(images),
      ],
      request,
    })
    if (inputGuardResponse) return inputGuardResponse

    let importInstruction: string
    let importBudget: RequirementImportBudget
    try {
      importBudget = requirementImportBudgetFromSettings(
        await getApplicationSettings(db),
      )
      importInstruction = await createRequirementsRuntime(
        db,
      ).service.buildImportInstruction(
        locale,
        requirementImportDestination(body),
      )
    } catch (error) {
      logSanitizedError(
        'AI requirement import instruction loading failed',
        error,
      )
      return createUnavailableAiStreamResponse(context, () =>
        recordStreamEvent('failure', 503),
      )
    }
    const systemPrompt = buildRequirementImportSystemPrompt(
      importInstruction,
      locale,
    )
    const userPrompt = buildRequirementImportUserPrompt({
      count: Math.min(body.count, importBudget.maxRows),
      locale,
      need: body.need,
    })
    const userContent = withImages(userPrompt, images)

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
      return createAiErrorStreamResponse(
        context,
        aiProviderStreamError(providerError),
        statusCode => recordStreamEvent('failure', statusCode),
      )
    }
    const resolvedModel = modelCapabilities.id
    const providerEvents = generateChatStream({
      format: buildRequirementImportResponseFormatSchema(locale, importBudget),
      messages: [
        { content: systemPrompt, role: 'system' },
        { content: userContent, role: 'user' },
      ],
      model: resolvedModel,
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
    let firstProviderEvent: IteratorResult<StreamEvent>
    try {
      firstProviderEvent = await providerEvents.next()
    } catch (error) {
      const providerError = normalizeAiProviderError(error, {
        correlationId: context.correlationId,
        modelProvider: modelCapabilities.provider,
        operation: 'chat.completions',
        requestId: context.requestId,
      })
      return createAiErrorStreamResponse(
        context,
        aiProviderStreamError(providerError),
        statusCode => recordStreamEvent('failure', statusCode),
      )
    }
    if (firstProviderEvent.done) {
      recordStreamEvent('failure', 499)
      return applyResponseCorrelationHeaders(
        new Response(null, { status: 499 }),
        context,
      )
    }
    if (firstProviderEvent.value.phase === 'error') {
      await providerEvents.return(undefined)
      return createAiErrorStreamResponse(
        context,
        firstProviderEvent.value,
        statusCode => recordStreamEvent('failure', statusCode),
      )
    }
    const firstStreamEvent: StreamEvent = firstProviderEvent.value

    async function* streamProviderEvents(): AsyncGenerator<StreamEvent> {
      yield firstStreamEvent
      yield* providerEvents
    }

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
          let sentGeneratingProgress = false
          let screenedThinkingLength = 0
          let latestThinking = ''
          for await (const event of streamProviderEvents()) {
            switch (event.phase) {
              case 'thinking': {
                let progressSafetyScreening: Awaited<
                  ReturnType<typeof screenAiOutputDetailed>
                >
                const thinkingText = event.thinkingSoFar || event.chunk
                const alreadyScreenedLength = Math.min(
                  screenedThinkingLength,
                  thinkingText.length,
                )
                const safetyWindowStart = Math.max(
                  0,
                  alreadyScreenedLength -
                    STREAMED_REASONING_SAFETY_CONTEXT_CHARS,
                )
                try {
                  progressSafetyScreening = await screenAiOutputDetailed(db, [
                    {
                      label: 'thinking',
                      text: thinkingText.slice(safetyWindowStart),
                    },
                  ])
                } catch (error) {
                  recordSafetyFilterFailure(error)
                  send('error', {
                    code: 'ai_provider_unavailable',
                    message: AI_PROVIDER_UNAVAILABLE_MESSAGE,
                  })
                  recordStreamEvent('failure', 503)
                  return
                }
                if (!progressSafetyScreening.decision.allowed) {
                  await recordAiSafetyBlock({
                    blockedStep: 'streamed_reasoning',
                    context,
                    db,
                    direction: 'output',
                    event: 'ai.output_safety.blocked',
                    model: resolvedModel,
                    operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
                    provider: modelCapabilities.provider,
                    request,
                    screening: progressSafetyScreening,
                  })
                  send('error', {
                    message: formatAiSafetyBlockedMessage(
                      body.locale,
                      'outputSafetyBlocked',
                      progressSafetyScreening.decision,
                    ),
                    model: resolvedModel,
                  })
                  recordStreamEvent('failure', 422)
                  return
                }
                screenedThinkingLength = thinkingText.length
                latestThinking = thinkingText
                break
              }
              case 'generating':
                if (!sentGeneratingProgress) {
                  sentGeneratingProgress = true
                  send('generating', { chunk: '' })
                }
                break
              case 'done': {
                const safeThinking = event.thinking || latestThinking
                const payloadValidation = parseAndValidatePayload(
                  event.rawContent,
                  importBudget,
                )
                if (!payloadValidation.ok) {
                  if (payloadValidation.code.startsWith('import_')) {
                    send('error', {
                      code: payloadValidation.code,
                      message: 'Generated import exceeds the allowed budget.',
                    })
                  } else {
                    const providerError = normalizeAiProviderError(null, {
                      code: 'ai_provider_invalid_response',
                      correlationId: context.correlationId,
                      modelProvider: modelCapabilities.provider,
                      operation: 'chat.completions',
                      requestId: context.requestId,
                    })
                    const streamError = aiProviderStreamError(providerError)
                    send('error', {
                      code: streamError.code,
                      message: streamError.message,
                    })
                  }
                  recordStreamEvent(
                    'failure',
                    payloadValidation.status,
                    event.stats,
                  )
                  return
                }
                let outputSafetyScreening: Awaited<
                  ReturnType<typeof screenAiOutputDetailed>
                >
                try {
                  outputSafetyScreening = await screenAiOutputDetailed(db, [
                    { label: 'rawContent', text: event.rawContent },
                    { label: 'thinking', text: safeThinking },
                  ])
                } catch (error) {
                  recordSafetyFilterFailure(error)
                  send('error', {
                    code: 'ai_provider_unavailable',
                    message: AI_PROVIDER_UNAVAILABLE_MESSAGE,
                  })
                  recordStreamEvent('failure', 503, event.stats)
                  return
                }
                if (!outputSafetyScreening.decision.allowed) {
                  await recordAiSafetyBlock({
                    blockedStep: 'final_model_output',
                    context,
                    db,
                    direction: 'output',
                    event: 'ai.output_safety.blocked',
                    model: resolvedModel,
                    operation: AI_GENERATE_REQUIREMENT_IMPORT_OPERATION,
                    provider: modelCapabilities.provider,
                    request,
                    screening: outputSafetyScreening,
                  })
                  send('error', {
                    message: formatAiSafetyBlockedMessage(
                      body.locale,
                      'outputSafetyBlocked',
                      outputSafetyScreening.decision,
                    ),
                    model: resolvedModel,
                    stats: event.stats,
                  })
                  recordStreamEvent('failure', 422, event.stats)
                  return
                }

                const payload = payloadValidation.payload
                const rawContent = JSON.stringify(payload)
                if (safeThinking) {
                  send('thinking', { thinkingSoFar: safeThinking })
                }
                send('done', {
                  model: resolvedModel,
                  payload,
                  rawContent,
                  stats: event.stats,
                  thinking: safeThinking,
                })
                recordStreamEvent('success', 200, event.stats)
                return
              }
              case 'error':
                send('error', { code: event.code, message: event.message })
                recordStreamEvent('failure', 503)
                return
            }
          }
        } catch (error) {
          const providerError = normalizeAiProviderError(error, {
            correlationId: context.correlationId,
            operation: 'chat.completions',
            requestId: context.requestId,
          })
          const streamError = aiProviderStreamError(providerError)
          send('error', {
            code: streamError.code,
            message: streamError.message,
          })
          recordStreamEvent('failure', 503)
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
