'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

interface Type {
  id: number
  nameEn: string
  nameSv: string
}

interface TypeCategory {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
  requirementTypeId: number
}

export default function KravtyperClient() {
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const [types, setTypes] = useState<Type[]>([])
  const [typeCategories, setTypeCategories] = useState<TypeCategory[]>([])
  const [loading, setLoading] = useState(true)

  const getName = (cat: TypeCategory) =>
    locale === 'sv' ? cat.nameSv : cat.nameEn
  const getTypeName = (type: Type) =>
    locale === 'sv' ? type.nameSv : type.nameEn

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [typesRes, catRes] = await Promise.all([
      fetch('/api/requirement-types'),
      fetch('/api/requirement-type-categories'),
    ])
    if (typesRes.ok)
      setTypes(((await typesRes.json()) as { types?: Type[] }).types ?? [])
    if (catRes.ok)
      setTypeCategories(
        ((await catRes.json()) as { typeCategories?: TypeCategory[] })
          .typeCategories ?? [],
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

        <div className="space-y-8">
          {types.map(type => {
            const topLevel = typeCategories.filter(
              c => c.requirementTypeId === type.id && !c.parentId,
            )
            return (
              <div
                className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6 transition-all duration-200 hover:shadow-md"
                key={type.id}
              >
                <h2 className="text-lg font-semibold mb-4">
                  {getTypeName(type)}
                </h2>
                {topLevel.length === 0 ? (
                  <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                    {tc('noResults')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {topLevel.map(parent => {
                      const children = typeCategories.filter(
                        c => c.parentId === parent.id,
                      )
                      return (
                        <div key={parent.id}>
                          <h3 className="text-sm font-medium text-primary-700 dark:text-primary-300">
                            {getName(parent)}
                          </h3>
                          {children.length > 0 && (
                            <ul className="ml-4 mt-1 space-y-0.5">
                              {children.map(child => (
                                <li
                                  className="text-sm text-secondary-700 dark:text-secondary-300"
                                  key={child.id}
                                >
                                  {getName(child)}
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
            )
          })}
        </div>
      </div>
    </div>
  )
}
