'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

const REQUIREMENT_CATEGORIES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementCategories.overview.body',
      headingKey: 'requirementCategories.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementCategories.boundary.body',
      headingKey: 'requirementCategories.boundary.heading',
    },
  ],
  titleKey: 'requirementCategories.title',
}

interface RequirementCategory {
  id: number
  nameEn: string
  nameSv: string
}

export default function RequirementCategoriesClient() {
  useHelpContent(REQUIREMENT_CATEGORIES_HELP)
  const t = useTranslations('requirementCategoryAdmin')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const locale = useLocale()
  const [categories, setCategories] = useState<RequirementCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const getName = useCallback(
    (category: RequirementCategory) =>
      locale === 'sv' ? category.nameSv : category.nameEn,
    [locale],
  )

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((left, right) =>
        getName(left).localeCompare(getName(right), locale, {
          sensitivity: 'base',
        }),
      ),
    [categories, getName, locale],
  )

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setHasError(false)

    try {
      const response = await fetch('/api/requirement-categories')
      if (!response.ok) {
        setHasError(true)
        setCategories([])
        return
      }

      const data = (await response.json()) as {
        categories?: RequirementCategory[]
      }
      setCategories(data.categories ?? [])
    } catch {
      setHasError(true)
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  if (loading) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          <p
            className="text-secondary-600 dark:text-secondary-400"
            role="status"
          >
            {tc('loading')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('categories')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-secondary-600 dark:text-secondary-300">
            {t('description')}
          </p>
        </div>

        {hasError ? (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {t('loadError')}
          </div>
        ) : null}

        {!hasError && sortedCategories.length === 0 ? (
          <div className="rounded-2xl border border-secondary-200/70 bg-white/80 p-6 text-sm text-secondary-600 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/70 dark:text-secondary-300">
            {t('emptyState')}
          </div>
        ) : null}

        {!hasError && sortedCategories.length > 0 ? (
          <section
            aria-labelledby="requirement-categories-heading"
            className="overflow-hidden rounded-2xl border border-secondary-200/70 bg-white/90 shadow-sm dark:border-secondary-700/60 dark:bg-secondary-900/80"
            {...devMarker({
              context: 'requirement categories',
              name: 'read-only list',
              priority: 340,
            })}
          >
            <h2 className="sr-only" id="requirement-categories-heading">
              {t('listHeading')}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-secondary-200 dark:divide-secondary-700">
                <thead className="bg-secondary-50/80 dark:bg-secondary-950/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                      {t('id')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
                      {t('name')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                  {sortedCategories.map(category => (
                    <tr
                      data-testid={`requirement-category-row-${category.id}`}
                      key={category.id}
                      {...devMarker({
                        context: 'requirement categories',
                        name: 'category row',
                        priority: 320,
                        value: getName(category),
                      })}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-secondary-500 dark:text-secondary-400">
                        {category.id}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-secondary-900 dark:text-secondary-100">
                        {getName(category)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
