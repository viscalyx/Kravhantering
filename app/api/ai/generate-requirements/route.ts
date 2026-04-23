import {
  type ContentPart,
  generateChatStream,
  type ProviderPreferences,
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

export async function POST(request: Request) {
  let body: {
    customInstruction?: string
    images?: Array<{ dataUrl: string }>
    locale?: string
    model?: string
    providerPreferences?: ProviderPreferences
    reasoningEffort?: string
    supportedParameters?: string[]
    topic?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  if (typeof body.topic !== 'string' || !body.topic.trim()) {
    return new Response(JSON.stringify({ error: 'topic is required' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  if (body.topic.length > 4000) {
    return new Response(
      JSON.stringify({ error: 'topic exceeds maximum length of 4000' }),
      { headers: { 'Content-Type': 'application/json' }, status: 400 },
    )
  }

  if (
    body.customInstruction !== undefined &&
    (typeof body.customInstruction !== 'string' ||
      body.customInstruction.length > 4000)
  ) {
    return new Response(
      JSON.stringify({
        error: 'customInstruction must be a string with max length 4000',
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 400 },
    )
  }

  if (
    body.model !== undefined &&
    (typeof body.model !== 'string' || body.model.length > 100)
  ) {
    return new Response(
      JSON.stringify({ error: 'model must be a string with max length 100' }),
      { headers: { 'Content-Type': 'application/json' }, status: 400 },
    )
  }

  // Validate providerPreferences
  let providerPreferences: ProviderPreferences | undefined
  if (body.providerPreferences !== undefined) {
    const pp = body.providerPreferences
    if (typeof pp !== 'object' || pp === null || Array.isArray(pp)) {
      return new Response(
        JSON.stringify({ error: 'providerPreferences must be an object' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 },
      )
    }
    providerPreferences = {}
    if (pp.data_collection !== undefined) {
      if (pp.data_collection !== 'allow' && pp.data_collection !== 'deny') {
        return new Response(
          JSON.stringify({
            error:
              'providerPreferences.data_collection must be "allow" or "deny"',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }
      providerPreferences.data_collection = pp.data_collection
    }
    if (pp.zdr !== undefined) {
      if (typeof pp.zdr !== 'boolean') {
        return new Response(
          JSON.stringify({
            error: 'providerPreferences.zdr must be a boolean',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }
      providerPreferences.zdr = pp.zdr
    }
    if (pp.enforce_distillable_text !== undefined) {
      if (typeof pp.enforce_distillable_text !== 'boolean') {
        return new Response(
          JSON.stringify({
            error:
              'providerPreferences.enforce_distillable_text must be a boolean',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }
      providerPreferences.enforce_distillable_text = pp.enforce_distillable_text
    }
  }

  const locale: 'en' | 'sv' =
    body.locale === 'en' || body.locale === 'sv' ? body.locale : 'en'

  // Validate images (optional)
  const ALLOWED_IMAGE_MIMES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
  ]
  const MAX_IMAGES = 3
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

  const images = body.images ?? []
  if (!Array.isArray(images)) {
    return new Response(JSON.stringify({ error: 'images must be an array' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
  if (images.length > MAX_IMAGES) {
    return new Response(
      JSON.stringify({
        error: `Maximum ${MAX_IMAGES} images allowed`,
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 400 },
    )
  }
  for (const img of images) {
    if (typeof img?.dataUrl !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Each image must have a dataUrl string' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 },
      )
    }
    const mimeMatch = img.dataUrl.match(/^data:([^;]+);base64,/)
    if (!mimeMatch || !ALLOWED_IMAGE_MIMES.includes(mimeMatch[1])) {
      return new Response(
        JSON.stringify({
          error: 'Unsupported image type. Use PNG, JPEG, GIF or WebP.',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 },
      )
    }
    // Check approximate decoded size (base64 inflates ~33%)
    const base64Data = img.dataUrl.slice(img.dataUrl.indexOf(',') + 1)
    const approxBytes = (base64Data.length * 3) / 4
    if (approxBytes > MAX_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({ error: 'Image exceeds the 10 MB size limit' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 },
      )
    }
  }
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
