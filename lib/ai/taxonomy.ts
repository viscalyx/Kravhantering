import type { TaxonomyData } from '@/lib/ai/requirement-prompt'
import { listCategories } from '@/lib/dal/requirement-categories'
import {
  listQualityCharacteristics,
  listTypes,
} from '@/lib/dal/requirement-types'
import { listRiskLevels } from '@/lib/dal/risk-levels'
import { listScenarios } from '@/lib/dal/usage-scenarios'

export async function loadTaxonomy(
  db: Parameters<typeof listCategories>[0],
  locale: 'en' | 'sv',
): Promise<TaxonomyData> {
  const nameKey: 'nameSv' | 'nameEn' = locale === 'sv' ? 'nameSv' : 'nameEn'

  const [categories, types, qcs, riskLevels, scenarios] = await Promise.all([
    listCategories(db),
    listTypes(db),
    listQualityCharacteristics(db),
    listRiskLevels(db),
    listScenarios(db),
  ])

  const qcMap = new Map(qcs.map(qc => [qc.id, qc]))

  return {
    categories: categories.map(category => ({
      id: category.id,
      name: category[nameKey],
    })),
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
