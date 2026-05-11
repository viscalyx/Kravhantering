'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

const REQUIREMENT_TYPES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementTypes.overview.body',
      headingKey: 'requirementTypes.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementTypes.quality.body',
      headingKey: 'requirementTypes.quality.heading',
    },
  ],
  titleKey: 'requirementTypes.title',
}

interface Type {
  id: number
  nameEn: string
  nameSv: string
}

interface TypeCategory {
  chapterId: string
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
  requirementTypeId: number
}

function compareChapterIds(a: string, b: string) {
  const left = a.split('.').map(part => Number(part))
  const right = b.split('.').map(part => Number(part))
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function ChapterBadge({ chapterId }: { chapterId: string }) {
  return (
    <span className="inline-flex shrink-0 rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 font-mono text-[0.7rem] leading-none text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
      {chapterId}
    </span>
  )
}

export default function RequirementTypesClient() {
  useHelpContent(REQUIREMENT_TYPES_HELP)
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const th = useTranslations('help')
  const locale = useLocale()

  const [types, setTypes] = useState<Type[]>([])
  const [qualityCharacteristics, setQualityCharacteristics] = useState<
    TypeCategory[]
  >([])
  const [loading, setLoading] = useState(true)

  const getName = (cat: TypeCategory) =>
    locale === 'sv' ? cat.nameSv : cat.nameEn
  const getTypeName = (type: Type) =>
    locale === 'sv' ? type.nameSv : type.nameEn

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [typesRes, catRes] = await Promise.all([
      fetch('/api/requirement-types'),
      fetch('/api/quality-characteristics'),
    ])
    if (typesRes.ok)
      setTypes(((await typesRes.json()) as { types?: Type[] }).types ?? [])
    if (catRes.ok)
      setQualityCharacteristics(
        ((await catRes.json()) as { qualityCharacteristics?: TypeCategory[] })
          .qualityCharacteristics ?? [],
      )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-6">
          {tn('types')}
        </h1>

        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-8 items-start">
          {types.map(type => {
            const topLevel = qualityCharacteristics
              .filter(c => c.requirementTypeId === type.id && !c.parentId)
              .sort((a, b) => compareChapterIds(a.chapterId, b.chapterId))
            return (
              <div
                className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border dark:border-secondary-700 shadow-sm transition-all duration-200 hover:shadow-md overflow-hidden"
                key={type.id}
                {...devMarker({
                  context: 'requirement types',
                  name: 'type card',
                  priority: 340,
                  value: getTypeName(type),
                })}
              >
                {/* Zone A — Kravtyp */}
                <div className="px-6 pt-6 pb-4">
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    {getTypeName(type)}
                  </h2>
                </div>

                {/* Connector: dashed lines flanking ISO badge */}
                <div className="mx-6 flex items-center gap-2">
                  <div className="h-px flex-1 border-t-2 border-dashed border-primary-200 dark:border-primary-700" />
                  <span
                    className="text-xs font-mono bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded border border-primary-200 dark:border-primary-800 select-none"
                    {...devMarker({
                      context: 'requirement types',
                      name: 'iso badge',
                      priority: 330,
                    })}
                  >
                    ISO/IEC 25010:2023
                  </span>
                  <div className="h-px flex-1 border-t-2 border-dashed border-primary-200 dark:border-primary-700" />
                </div>

                {/* Zone B — ISO koppling */}
                <div className="mx-4 mb-4 mt-3 rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-950/20 p-4">
                  <h3
                    className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-3 uppercase tracking-wide"
                    {...devMarker({
                      context: 'requirement types',
                      name: 'quality heading',
                      priority: 330,
                    })}
                  >
                    {th('requirementTypes.quality.heading')}
                  </h3>
                  {topLevel.length === 0 ? (
                    <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                      {tc('noResults')}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-3">
                      {topLevel.map(parent => {
                        const children = qualityCharacteristics
                          .filter(c => c.parentId === parent.id)
                          .sort((a, b) =>
                            compareChapterIds(a.chapterId, b.chapterId),
                          )
                        return (
                          <div key={parent.id}>
                            <h3 className="mb-1 flex min-w-0 items-start gap-2 text-sm font-medium leading-snug text-primary-700 dark:text-primary-300">
                              <ChapterBadge chapterId={parent.chapterId} />
                              <span className="min-w-0">{getName(parent)}</span>
                            </h3>
                            {children.length > 0 && (
                              <ul className="ml-3 space-y-0.5">
                                {children.map(child => (
                                  <li
                                    className="flex min-w-0 items-start gap-2 border-l-2 border-primary-200 pl-2 text-xs leading-snug text-secondary-600 dark:border-primary-800 dark:text-secondary-400"
                                    key={child.id}
                                  >
                                    <ChapterBadge chapterId={child.chapterId} />
                                    <span className="min-w-0">
                                      {getName(child)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
