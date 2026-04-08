import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  buildSystemPrompt,
  type TaxonomyData,
} from '@/lib/ai/requirement-prompt'
import { listCategories } from '@/lib/dal/requirement-categories'
import {
  listQualityCharacteristics,
  listTypes,
} from '@/lib/dal/requirement-types'
import { listRiskLevels } from '@/lib/dal/risk-levels'
import { listScenarios } from '@/lib/dal/usage-scenarios'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const locale =
    request.nextUrl.searchParams.get('locale') === 'sv' ? 'sv' : 'en'

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  const taxonomy = await loadTaxonomy(db, locale)
  const prompt = buildSystemPrompt(taxonomy, locale)

  return NextResponse.json({ prompt })
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
