import { getCloudflareContext } from '@opennextjs/cloudflare'
import { generateChatStream } from '@/lib/ai/ollama-client'
import {
  buildSystemPrompt,
  buildUserPrompt,
  type GeneratedRequirement,
  REQUIREMENT_FORMAT_SCHEMA,
  type TaxonomyData,
  validateGeneratedRequirements,
} from '@/lib/ai/requirement-prompt'
import { listCategories } from '@/lib/dal/requirement-categories'
import {
  listQualityCharacteristics,
  listTypes,
} from '@/lib/dal/requirement-types'
import { listRiskLevels } from '@/lib/dal/risk-levels'
import { listScenarios } from '@/lib/dal/usage-scenarios'
import { getDb } from '@/lib/db'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    customInstruction?: string
    locale?: 'en' | 'sv'
    model?: string
    topic: string
  }

  if (!body.topic?.trim()) {
    return new Response(JSON.stringify({ error: 'topic is required' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const locale = body.locale ?? 'en'

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const taxonomy = await loadTaxonomy(db, locale)
  const systemPrompt = buildSystemPrompt(taxonomy, locale)
  const userPrompt = buildUserPrompt(body.topic, body.customInstruction, locale)

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
            { content: userPrompt, role: 'user' },
          ],
          model: body.model,
          signal: request.signal,
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
                model: body.model ?? process.env.OLLAMA_MODEL ?? 'qwen3:14b',
                rawContent: validated,
                stats: event.stats,
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

async function loadTaxonomy(
  db: Parameters<typeof listCategories>[0],
  locale: 'en' | 'sv',
): Promise<TaxonomyData> {
  const nameKey = locale === 'sv' ? 'nameSv' : 'nameEn'

  const [categories, types, qcs, riskLevels, scenarios] = await Promise.all([
    listCategories(db),
    listTypes(db),
    listQualityCharacteristics(db),
    listRiskLevels(db),
    listScenarios(db),
  ])

  // Build parent name map for quality characteristics
  const qcMap = new Map(qcs.map(qc => [qc.id, qc]))

  return {
    categories: categories.map(c => ({ id: c.id, name: c[nameKey] })),
    qualityCharacteristics: qcs.map(qc => ({
      id: qc.id,
      name: qc[nameKey],
      parentName: qc.parentId ? qcMap.get(qc.parentId)?.[nameKey] : undefined,
    })),
    riskLevels: riskLevels.map(r => ({ id: r.id, name: r[nameKey] })),
    scenarios: scenarios.map(s => ({ id: s.id, name: s[nameKey] })),
    types: types.map(t => ({ id: t.id, name: t[nameKey] })),
  }
}
