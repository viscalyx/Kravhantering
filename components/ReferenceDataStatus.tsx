'use client'

import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import type {
  ReferenceDataCatalog,
  ReferenceDataReadiness,
} from '@/hooks/useTaxonomyOptions'
import { devMarker } from '@/lib/developer-mode-markers'

interface ReferenceDataStatusProps {
  id: string
  readiness: ReferenceDataReadiness
}

interface ReferenceDataSaveHintProps {
  id: string
}

function catalogTranslationKey(
  catalog: ReferenceDataCatalog,
):
  | 'catalogs.areas'
  | 'catalogs.categories'
  | 'catalogs.needsReferences'
  | 'catalogs.normReferences'
  | 'catalogs.priorityLevels'
  | 'catalogs.qualityCharacteristics'
  | 'catalogs.requirementPackages'
  | 'catalogs.types' {
  return `catalogs.${catalog}`
}

export function ReferenceDataSaveHint({ id }: ReferenceDataSaveHintProps) {
  const t = useTranslations('referenceData')

  return (
    <p
      className="min-w-0 flex-1 text-sm leading-5 text-amber-800 dark:text-amber-200"
      id={id}
    >
      {t('saveBlocked')}
    </p>
  )
}

export default function ReferenceDataStatus({
  id,
  readiness,
}: ReferenceDataStatusProps) {
  const t = useTranslations('referenceData')
  const tc = useTranslations('common')
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const [retrying, setRetrying] = useState(false)
  const failedCatalogs =
    readiness.emptyRequiredCatalogs.length > 0
      ? readiness.emptyRequiredCatalogs
      : readiness.failedCatalogs.length > 0
        ? readiness.failedCatalogs
        : readiness.refreshFailedCatalogs
  const failedCatalogNames = failedCatalogs
    .map(catalog => t(catalogTranslationKey(catalog)))
    .join(', ')

  if (failedCatalogs.length > 0) {
    const configurationBlocked = readiness.emptyRequiredCatalogs.length > 0
    const blocksSave =
      configurationBlocked || readiness.failedCatalogs.length > 0

    return (
      <div
        className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
        id={id}
        role="alert"
        {...devMarker({
          context: 'requirement form',
          name: 'status',
          value: 'reference data error',
        })}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {configurationBlocked
                ? t('configurationBlocked')
                : blocksSave
                  ? t('loadFailed')
                  : t('refreshFailed')}
            </p>
            <p className="mt-1">
              {t('failedCatalogs', { catalogs: failedCatalogNames })}
            </p>
            <button
              className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-600 dark:bg-secondary-900 dark:text-amber-100 dark:hover:bg-amber-950"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true)
                await readiness.retryFailed()
                setRetrying(false)
                requestAnimationFrame(() => retryButtonRef.current?.focus())
              }}
              ref={retryButtonRef}
              type="button"
              {...devMarker({
                context: 'requirement form reference data',
                name: 'button',
                value: 'retry failed catalogs',
              })}
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {retrying ? tc('loading') : tc('retry')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (readiness.loadingCatalogs.length > 0) {
    return (
      <div
        className="mb-5 flex items-center gap-2 rounded-xl border border-secondary-200 bg-secondary-50 p-3 text-sm text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-200"
        id={id}
        role="status"
        {...devMarker({
          context: 'requirement form',
          name: 'status',
          value: 'reference data loading',
        })}
      >
        <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  if (readiness.refreshingCatalogs.length > 0) {
    return (
      <div
        className="mb-5 flex items-center gap-2 rounded-xl border border-secondary-200 bg-secondary-50 p-3 text-sm text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-200"
        id={id}
        role="status"
        {...devMarker({
          context: 'requirement form',
          name: 'status',
          value: 'reference data refreshing',
        })}
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{t('refreshing')}</span>
      </div>
    )
  }

  return null
}
