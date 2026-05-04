import type { TaxonomyData } from '@/lib/ai/requirement-prompt'
import { listCategories } from '@/lib/dal/requirement-categories'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import {
  listQualityCharacteristics,
  listTypes,
} from '@/lib/dal/requirement-types'
import { listRiskLevels } from '@/lib/dal/risk-levels'

export async function loadTaxonomy(
  db: Parameters<typeof listCategories>[0],
  locale: 'en' | 'sv',
): Promise<TaxonomyData> {
  const nameKey: 'nameSv' | 'nameEn' = locale === 'sv' ? 'nameSv' : 'nameEn'

  const [categories, types, qcs, riskLevels, requirementPackages] =
    await Promise.all([
      listCategories(db),
      listTypes(db),
      listQualityCharacteristics(db),
      listRiskLevels(db),
      listRequirementPackages(db),
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
    requirementPackages: requirementPackages.map(s => ({
      id: s.id,
      name: s[nameKey],
    })),
    types: types.map(t => ({ id: t.id, name: t[nameKey] })),
  }
}
