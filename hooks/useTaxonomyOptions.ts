'use client'

import { useCallback, useEffect, useState } from 'react'

export interface TaxonomyOption {
  id: number
  nameEn: string
  nameSv: string
}

export interface AreaOption {
  id: number
  name: string
  ownerName: string | null
}

export interface QualityCharacteristicOption {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
}

export interface RequirementPackageOption {
  id: number
  nameEn: string
  nameSv: string
}

export interface NormReferenceOption {
  id: number
  name: string
  normReferenceId: string
}

export interface TaxonomyOptions {
  areas: AreaOption[]
  categories: TaxonomyOption[]
  loading: boolean
  normReferences: NormReferenceOption[]
  qualityCharacteristics: QualityCharacteristicOption[]
  requirementPackages: RequirementPackageOption[]
  riskLevels: TaxonomyOption[]
  types: TaxonomyOption[]
}

export function useTaxonomyOptions(typeId: string): TaxonomyOptions {
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [categories, setCategories] = useState<TaxonomyOption[]>([])
  const [types, setTypes] = useState<TaxonomyOption[]>([])
  const [qualityCharacteristics, setQualityCharacteristics] = useState<
    QualityCharacteristicOption[]
  >([])
  const [riskLevels, setRiskLevels] = useState<TaxonomyOption[]>([])
  const [requirementPackages, setRequirementPackages] = useState<
    RequirementPackageOption[]
  >([])
  const [normReferences, setNormReferences] = useState<NormReferenceOption[]>(
    [],
  )
  const [loading, setLoading] = useState(true)

  const fetchOptions = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        fetch('/api/requirement-areas'),
        fetch('/api/requirement-categories'),
        fetch('/api/requirement-types'),
        fetch('/api/requirement-packages'),
        fetch('/api/norm-references'),
        fetch('/api/risk-levels'),
      ])
      const [
        areasResult,
        catResult,
        typesResult,
        requirementPackagesResult,
        normRefsResult,
        riskLevelsResult,
      ] = results
      if (areasResult.status === 'fulfilled' && areasResult.value.ok)
        setAreas(
          ((await areasResult.value.json()) as { areas?: AreaOption[] })
            .areas ?? [],
        )
      if (catResult.status === 'fulfilled' && catResult.value.ok)
        setCategories(
          (
            (await catResult.value.json()) as {
              categories?: TaxonomyOption[]
            }
          ).categories ?? [],
        )
      if (typesResult.status === 'fulfilled' && typesResult.value.ok)
        setTypes(
          ((await typesResult.value.json()) as { types?: TaxonomyOption[] })
            .types ?? [],
        )
      if (
        requirementPackagesResult.status === 'fulfilled' &&
        requirementPackagesResult.value.ok
      )
        setRequirementPackages(
          (
            (await requirementPackagesResult.value.json()) as {
              requirementPackages?: RequirementPackageOption[]
            }
          ).requirementPackages ?? [],
        )
      if (normRefsResult.status === 'fulfilled' && normRefsResult.value.ok) {
        setNormReferences(
          (
            (await normRefsResult.value.json()) as {
              normReferences?: NormReferenceOption[]
            }
          ).normReferences ?? [],
        )
      }
      if (riskLevelsResult.status === 'fulfilled' && riskLevelsResult.value.ok)
        setRiskLevels(
          (
            (await riskLevelsResult.value.json()) as {
              riskLevels?: TaxonomyOption[]
            }
          ).riskLevels ?? [],
        )
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchQualityCharacteristics = useCallback(async (tid: string) => {
    if (!tid) {
      setQualityCharacteristics([])
      return
    }
    const res = await fetch(`/api/quality-characteristics?typeId=${tid}`)
    if (res.ok)
      setQualityCharacteristics(
        (
          (await res.json()) as {
            qualityCharacteristics?: QualityCharacteristicOption[]
          }
        ).qualityCharacteristics ?? [],
      )
  }, [])

  useEffect(() => {
    void fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    void fetchQualityCharacteristics(typeId)
  }, [typeId, fetchQualityCharacteristics])

  return {
    areas,
    categories,
    loading,
    normReferences,
    qualityCharacteristics,
    requirementPackages,
    riskLevels,
    types,
  }
}
