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
  name: string
}

export interface NormReferenceOption {
  id: number
  isArchived?: boolean
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

const EMPTY_SELECTED_NORM_REFERENCE_IDS: number[] = []

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  )
}

export function useTaxonomyOptions(
  typeId: string,
  selectedNormReferenceIds: number[] = EMPTY_SELECTED_NORM_REFERENCE_IDS,
): TaxonomyOptions {
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
        fetch(buildNormReferencesUrl(selectedNormReferenceIds)),
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
  }, [selectedNormReferenceIds])

  const fetchQualityCharacteristics = useCallback(
    async (tid: string, signal: AbortSignal) => {
      if (!tid) {
        setQualityCharacteristics([])
        return
      }
      try {
        const res = await fetch(`/api/quality-characteristics?typeId=${tid}`, {
          signal,
        })
        if (!res.ok) {
          if (!signal.aborted) setQualityCharacteristics([])
          return
        }
        const body = (await res.json()) as {
          qualityCharacteristics?: QualityCharacteristicOption[]
        }
        if (!signal.aborted)
          setQualityCharacteristics(body.qualityCharacteristics ?? [])
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return
        setQualityCharacteristics([])
      }
    },
    [],
  )

  useEffect(() => {
    void fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    const controller = new AbortController()
    void fetchQualityCharacteristics(typeId, controller.signal)
    return () => {
      controller.abort()
    }
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

function buildNormReferencesUrl(selectedNormReferenceIds: number[]): string {
  const ids = [...new Set(selectedNormReferenceIds)].filter(
    id => Number.isInteger(id) && id > 0,
  )
  if (ids.length === 0) return '/api/norm-references'
  const params = new URLSearchParams()
  for (const id of ids) {
    params.append('includeIds', String(id))
  }
  return `/api/norm-references?${params.toString()}`
}
