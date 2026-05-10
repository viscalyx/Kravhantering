import { z } from 'zod'
import {
  type ContentPart,
  generateChatStream,
} from '@/lib/ai/openrouter-client'
import {
  buildSystemPrompt,
  buildUserPrompt,
  type GeneratedRequirement,
  REQUIREMENT_FORMAT_SCHEMA,
  validateGeneratedRequirements,
} from '@/lib/ai/requirement-prompt'
import { loadTaxonomy } from '@/lib/ai/taxonomy'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  ARRAY_INPUT_MAX_ITEMS,
  localeSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const

const MAX_AI_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_AI_IMAGES = 3
const MAX_AI_INSTRUCTION_LENGTH = 4000
const MAX_AI_MODEL_LENGTH = 100
const MAX_AI_PARAMETER_LENGTH = 100
const MAX_AI_TOPIC_LENGTH = 4000

const imageDataUrlSchema = z.string().superRefine((dataUrl, context) => {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/)
  if (
    !mimeMatch ||
    !ALLOWED_IMAGE_MIMES.includes(
      mimeMatch[1] as (typeof ALLOWED_IMAGE_MIMES)[number],
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Unsupported image type. Use PNG, JPEG, GIF or WebP.',
    })
    return
  }

  const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const approxBytes = (base64Data.length * 3) / 4
  if (approxBytes > MAX_AI_IMAGE_BYTES) {
    context.addIssue({
      code: 'custom',
      message: 'Image exceeds the 10 MB size limit',
    })
  }
})

const providerPreferencesSchema = z
  .object({
    data_collection: z.enum(['allow', 'deny']).optional(),
    enforce_distillable_text: z.boolean().optional(),
    zdr: z.boolean().optional(),
  })
  .strict()

const generateRequirementsSchema = z
  .object({
    customInstruction: z
      .string()
      .trim()
      .max(MAX_AI_INSTRUCTION_LENGTH)
      .optional(),
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
    locale: localeSchema.optional().default('en'),
    model: z.string().trim().max(MAX_AI_MODEL_LENGTH).optional(),
    providerPreferences: providerPreferencesSchema.optional(),
    reasoningEffort: z.string().trim().max(MAX_AI_MODEL_LENGTH).optional(),
    supportedParameters: z
      .array(z.string().trim().min(1).max(MAX_AI_PARAMETER_LENGTH))
      .max(ARRAY_INPUT_MAX_ITEMS)
      .optional(),
    topic: z.string().trim().min(1).max(MAX_AI_TOPIC_LENGTH),
  })
  .strict()

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(
    request,
    generateRequirementsSchema,
  )
  if (!parsedBody.ok) {
    return parsedBody.response
  }
  const body = parsedBody.data
  const providerPreferences = body.providerPreferences
  const { images, locale } = body
  const db = await getRequestSqlServerDataSource()

  const taxonomy = await loadTaxonomy(db, locale)
  const systemPrompt = buildSystemPrompt(taxonomy, locale)
  const userPrompt = buildUserPrompt(body.topic, body.customInstruction, locale)

  // Build user message content: text-only or multipart with images
  let userContent: ContentPart[] | string = userPrompt
  if (images.length > 0) {
    const parts: ContentPart[] = [{ text: userPrompt, type: 'text' }]
    for (const img of images) {
      parts.push({ image_url: { url: img.dataUrl }, type: 'image_url' })
    }
    userContent = parts
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }

      try {
        for await (const event of generateChatStream({
          format: REQUIREMENT_FORMAT_SCHEMA,
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: userContent, role: 'user' },
          ],
          model: body.model,
          providerPreferences,
          reasoningEffort:
            typeof body.reasoningEffort === 'string'
              ? body.reasoningEffort
              : undefined,
          signal: request.signal,
          supportedParameters: Array.isArray(body.supportedParameters)
            ? body.supportedParameters
            : undefined,
        })) {
          switch (event.phase) {
            case 'thinking':
              send('thinking', {
                chunk: event.chunk,
                thinkingSoFar: event.thinkingSoFar,
              })
              break
            case 'generating':
              send('generating', { chunk: event.chunk })
              break
            case 'done': {
              // Validate taxonomy IDs before sending to client
              let validated = event.rawContent
              try {
                const parsed = JSON.parse(event.rawContent) as {
                  requirements: GeneratedRequirement[]
                }
                if (parsed.requirements) {
                  parsed.requirements = validateGeneratedRequirements(
                    parsed.requirements,
                    taxonomy,
                  )
                  validated = JSON.stringify(parsed)
                }
              } catch {
                // If parsing fails, send raw content; client will handle the error
              }
              send('done', {
                model:
                  body.model ?? process.env.NEXT_PUBLIC_DEFAULT_MODEL ?? '',
                rawContent: validated,
                stats: event.stats,
                taxonomy,
                thinking: event.thinking,
              })
              break
            }
            case 'error':
              send('error', { message: event.message })
              break
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        send('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    },
  })
}
