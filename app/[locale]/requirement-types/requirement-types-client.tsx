'use client'

import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'

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
    {
      kind: 'text',
      bodyKey: 'requirementTypes.recovery.body',
      headingKey: 'requirementTypes.recovery.heading',
    },
  ],
  titleKey: 'requirementTypes.title',
}

type CatalogFailureReason =
  | 'invalidResponse'
  | 'network'
  | 'reauthentication'
  | 'server'

type RetryableCatalogFailureReason = Exclude<
  CatalogFailureReason,
  'reauthentication'
>

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

interface FailedCatalogSource {
  name: string
  reason: string
  source: 'quality-characteristics' | 'types'
}

class CatalogLoadError extends Error {
  constructor(readonly reason: CatalogFailureReason) {
    super('Catalog source unavailable')
    this.name = 'CatalogLoadError'
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

async function loadCatalogArray<T>(
  path: string,
  property: string,
  signal: AbortSignal,
): Promise<T[]> {
  let response: Response
  try {
    response = await apiFetch(path, { signal })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new CatalogLoadError('network')
  }

  if (response.status === 401) {
    throw new CatalogLoadError('reauthentication')
  }
  if (!response.ok) {
    throw new CatalogLoadError('server')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new CatalogLoadError('invalidResponse')
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Object.hasOwn(payload, property)
  ) {
    throw new CatalogLoadError('invalidResponse')
  }

  const catalog = (payload as Record<string, unknown>)[property]
  if (!Array.isArray(catalog)) {
    throw new CatalogLoadError('invalidResponse')
  }
  return catalog as T[]
}

function getCatalogFailureReason(error: unknown): string {
  return error instanceof CatalogLoadError ? error.reason : 'invalidResponse'
}

function getRetryableFailure(
  error: string | null,
): RetryableCatalogFailureReason | null {
  if (
    error === 'invalidResponse' ||
    error === 'network' ||
    error === 'server'
  ) {
    return error
  }
  return null
}

function compareChapterIds(a: string, b: string): number {
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
  const tp = useTranslations('requirementTypesPage')
  const locale = useLocale()
  const retryInFlightRef = useRef(false)
  const [retrying, setRetrying] = useState(false)
  const [retryingSources, setRetryingSources] = useState<FailedCatalogSource[]>(
    [],
  )
  const [recovered, setRecovered] = useState(false)

  const typesResource = useAsyncResource<Type[]>({
    fetcher: signal =>
      loadCatalogArray<Type>('/api/requirement-types', 'types', signal),
    getErrorMessage: getCatalogFailureReason,
    key: 'requirement-types',
  })
  const qualityCharacteristicsResource = useAsyncResource<TypeCategory[]>({
    fetcher: signal =>
      loadCatalogArray<TypeCategory>(
        '/api/quality-characteristics',
        'qualityCharacteristics',
        signal,
      ),
    getErrorMessage: getCatalogFailureReason,
    key: 'quality-characteristics',
  })

  const getName = (cat: TypeCategory) =>
    locale === 'sv' ? cat.nameSv : cat.nameEn
  const getTypeName = (type: Type) =>
    locale === 'sv' ? type.nameSv : type.nameEn

  const typesFailure = getRetryableFailure(typesResource.error)
  const qualityCharacteristicsFailure = getRetryableFailure(
    qualityCharacteristicsResource.error,
  )
  const failedSources: FailedCatalogSource[] = [
    typesFailure
      ? {
          name: tp('sources.types'),
          reason: tp(`reasons.${typesFailure}`),
          source: 'types' as const,
        }
      : null,
    qualityCharacteristicsFailure
      ? {
          name: tp('sources.qualityCharacteristics'),
          reason: tp(`reasons.${qualityCharacteristicsFailure}`),
          source: 'quality-characteristics' as const,
        }
      : null,
  ].filter(source => source !== null)
  const visibleFailedSources =
    failedSources.length > 0 ? failedSources : retryingSources

  const retryFailedSources = useCallback(async () => {
    if (retryInFlightRef.current) return

    const retries: Array<Promise<unknown>> = []
    if (typesFailure) retries.push(typesResource.reload())
    if (qualityCharacteristicsFailure) {
      retries.push(qualityCharacteristicsResource.reload())
    }
    if (retries.length === 0) return

    retryInFlightRef.current = true
    setRecovered(false)
    setRetryingSources([
      ...(typesFailure
        ? [
            {
              name: tp('sources.types'),
              reason: tp(`reasons.${typesFailure}`),
              source: 'types' as const,
            },
          ]
        : []),
      ...(qualityCharacteristicsFailure
        ? [
            {
              name: tp('sources.qualityCharacteristics'),
              reason: tp(`reasons.${qualityCharacteristicsFailure}`),
              source: 'quality-characteristics' as const,
            },
          ]
        : []),
    ])
    setRetrying(true)
    try {
      const results = await Promise.all(retries)
      if (results.every(result => result !== undefined)) {
        setRecovered(true)
      }
    } finally {
      retryInFlightRef.current = false
      setRetrying(false)
      setRetryingSources([])
    }
  }, [
    qualityCharacteristicsFailure,
    qualityCharacteristicsResource.reload,
    tp,
    typesFailure,
    typesResource.reload,
  ])

  const types = typesResource.data
  const qualityCharacteristics = qualityCharacteristicsResource.data

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <h1 className="mb-6 text-2xl font-bold text-secondary-900 dark:text-secondary-100">
          {tn('types')}
        </h1>

        {visibleFailedSources.length > 0 ? (
          <section
            className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-4 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
            {...devMarker({
              context: 'requirement types',
              name: 'source error alert',
              priority: 340,
              value: visibleFailedSources
                .map(source => source.source)
                .join(','),
            })}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{tp('errorTitle')}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {visibleFailedSources.map(source => (
                    <li key={source.source}>
                      <span className="font-medium">{source.name}:</span>{' '}
                      {source.reason}
                    </li>
                  ))}
                </ul>
                <button
                  className="mt-4 inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-red-600 dark:hover:bg-red-700 dark:focus-visible:ring-offset-red-950"
                  disabled={retrying}
                  onClick={() => void retryFailedSources()}
                  type="button"
                  {...devMarker({
                    context: 'requirement types',
                    name: 'retry action',
                    priority: 340,
                    value: retrying ? 'pending' : 'ready',
                  })}
                >
                  {retrying ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  )}
                  {retrying ? tp('retrying') : tc('retry')}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {recovered ? (
          <p
            className="mb-6 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200"
            role="status"
            {...devMarker({
              context: 'requirement types',
              name: 'recovery status',
              priority: 340,
            })}
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            {tp('recovered')}
          </p>
        ) : null}

        {typesResource.loading ? (
          <p
            className="flex items-center gap-2 text-secondary-600 dark:text-secondary-400"
            role="status"
            {...devMarker({
              context: 'requirement types',
              name: 'loading status',
              priority: 330,
              value: 'types',
            })}
          >
            <LoaderCircle
              aria-hidden="true"
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
            />
            {tp('loading.types')}
          </p>
        ) : null}

        {types && types.length > 0 && qualityCharacteristicsResource.loading ? (
          <p className="sr-only" role="status">
            {tp('loading.qualityCharacteristics')}
          </p>
        ) : null}

        {!typesResource.loading && types === undefined ? (
          <p
            className="flex items-center gap-2 text-secondary-600 dark:text-secondary-400"
            role="status"
            {...devMarker({
              context: 'requirement types',
              name: 'unavailable status',
              priority: 330,
              value:
                qualityCharacteristics !== undefined
                  ? 'types-quality-loaded'
                  : 'types',
            })}
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {qualityCharacteristics !== undefined
              ? tp('unavailable.typesWithQualityLoaded')
              : tp('unavailable.types')}
          </p>
        ) : null}

        {types?.length === 0 ? (
          <p
            className="text-secondary-600 dark:text-secondary-400"
            {...devMarker({
              context: 'requirement types',
              name: 'empty status',
              priority: 330,
              value: 'types',
            })}
          >
            {tp('empty.types')}
          </p>
        ) : null}

        {types && types.length > 0 ? (
          <div className="grid grid-cols-1 items-start gap-8 2xl:grid-cols-2">
            {types.map(type => {
              const topLevel = qualityCharacteristics
                ?.filter(c => c.requirementTypeId === type.id && !c.parentId)
                .sort((a, b) => compareChapterIds(a.chapterId, b.chapterId))
              return (
                <div
                  className="overflow-hidden rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md dark:border-secondary-700 dark:bg-secondary-900/60"
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
                    {qualityCharacteristicsResource.loading ? (
                      <p
                        className="flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400"
                        {...devMarker({
                          context: 'requirement types',
                          name: 'loading status',
                          priority: 330,
                          value: 'quality characteristics',
                        })}
                      >
                        <LoaderCircle
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        />
                        {tp('loading.qualityCharacteristics')}
                      </p>
                    ) : qualityCharacteristics === undefined ? (
                      <p
                        className="flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400"
                        {...devMarker({
                          context: 'requirement types',
                          name: 'unavailable status',
                          priority: 330,
                          value: 'quality characteristics',
                        })}
                      >
                        <AlertTriangle
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        {tp('unavailable.qualityCharacteristics')}
                      </p>
                    ) : topLevel?.length === 0 ? (
                      <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                        {tc('noResults')}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-1 gap-3">
                        {topLevel?.map(parent => {
                          const children = qualityCharacteristics
                            .filter(c => c.parentId === parent.id)
                            .sort((a, b) =>
                              compareChapterIds(a.chapterId, b.chapterId),
                            )
                          return (
                            <div key={parent.id}>
                              <h3 className="mb-1 flex min-w-0 items-start gap-2 text-sm font-medium leading-snug text-primary-700 dark:text-primary-300">
                                <ChapterBadge chapterId={parent.chapterId} />
                                <span className="min-w-0">
                                  {getName(parent)}
                                </span>
                              </h3>
                              {children.length > 0 && (
                                <ul className="ml-3 space-y-0.5">
                                  {children.map(child => (
                                    <li
                                      className="flex min-w-0 items-start gap-2 border-l-2 border-primary-200 pl-2 text-xs leading-snug text-secondary-600 dark:border-primary-800 dark:text-secondary-400"
                                      key={child.id}
                                    >
                                      <ChapterBadge
                                        chapterId={child.chapterId}
                                      />
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
        ) : null}
      </div>
    </div>
  )
}
