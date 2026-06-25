import type { TaxonomyData } from '@/lib/ai/requirement-prompt'
import { listPriorityLevels } from '@/lib/dal/priority-levels'
import { listCategories } from '@/lib/dal/requirement-categories'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import {
  listQualityCharacteristics,
  listTypes,
} from '@/lib/dal/requirement-types'

export async function loadTaxonomy(
  db: Parameters<typeof listCategories>[0],
  locale: 'en' | 'sv',
): Promise<TaxonomyData> {
  const nameKey: 'nameSv' | 'nameEn' = locale === 'sv' ? 'nameSv' : 'nameEn'
  const descriptionKey: 'descriptionSv' | 'descriptionEn' =
    locale === 'sv' ? 'descriptionSv' : 'descriptionEn'
  const assessmentCriteriaKey: 'assessmentCriteriaSv' | 'assessmentCriteriaEn' =
    locale === 'sv' ? 'assessmentCriteriaSv' : 'assessmentCriteriaEn'

  const [categories, types, qcs, priorityLevels, requirementPackages] =
    await Promise.all([
      listCategories(db),
      listTypes(db),
      listQualityCharacteristics(db),
      listPriorityLevels(db),
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
    priorityLevels: priorityLevels.map(priority => ({
      assessmentCriteria: priority[assessmentCriteriaKey],
      code: priority.code,
      description: priority[descriptionKey],
      id: priority.id,
      name: priority[nameKey],
    })),
    requirementPackages: requirementPackages.map(s => ({
      id: s.id,
      name: s.name,
      purposeAndScope: s.purposeAndScope,
    })),
    types: types.map(t => ({ id: t.id, name: t[nameKey] })),
  }
}
