'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

interface TypeCategory {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
  requirementTypeId: number
}

interface Type {
  id: number
  nameEn: string
  nameSv: string
}

export default function Iso25010Client() {
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const [types, setTypes] = useState<Type[]>([])
  const [categories, setCategories] = useState<TypeCategory[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [typesRes, catRes] = await Promise.all([
      fetch('/api/requirement-types'),
      fetch('/api/requirement-type-categories'),
    ])
    if (typesRes.ok)
      setTypes(((await typesRes.json()) as { types?: Type[] }).types ?? [])
    if (catRes.ok)
      setCategories(
        ((await catRes.json()) as { typeCategories?: TypeCategory[] })
          .typeCategories ?? [],
      )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getName = (cat: TypeCategory) =>
    locale === 'sv' ? cat.nameSv : cat.nameEn
  const getTypeName = (type: Type) =>
    locale === 'sv' ? type.nameSv : type.nameEn

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
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-2">
          {tn('iso25010')}
        </h1>
        <p className="text-secondary-600 dark:text-secondary-400 text-sm mb-6">
          ISO/IEC 25010:2023 — Systems and software Quality Requirements and
          Evaluation (SQuaRE)
        </p>

        <div className="space-y-8">
          {types.map(type => {
            const topLevel = categories.filter(
              c => c.requirementTypeId === type.id && !c.parentId,
            )
            return (
              <div key={type.id}>
                <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4">
                  {getTypeName(type)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {topLevel.map(parent => {
                    const children = categories.filter(
                      c => c.parentId === parent.id,
                    )
                    return (
                      <div
                        className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-5 transition-all duration-200 hover:shadow-md"
                        key={parent.id}
                      >
                        <h3 className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-3">
                          {getName(parent)}
                        </h3>
                        {children.length > 0 && (
                          <ul className="space-y-1">
                            {children.map(child => (
                              <li
                                className="text-sm text-secondary-700 dark:text-secondary-300 pl-3 border-l-2 border-primary-200 dark:border-primary-800"
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
