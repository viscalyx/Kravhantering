'use client'

import { Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { devMarker } from '@/lib/developer-mode-markers'
import { type DeviationStep, STATUS_REVIEW } from './types'

interface RequirementReportMenuBaseProps {
  currentStatusId: number
  detailContext?: string
  locale: string
  requirementId: number | string
}

type RequirementReportMenuProps =
  | (RequirementReportMenuBaseProps & {
      deviationStep: DeviationStep | null
      specificationItemId: number
      specificationSlug: string
      variant: 'specification'
    })
  | (RequirementReportMenuBaseProps & {
      variant: 'standalone'
    })

export default function RequirementReportMenu(
  props: RequirementReportMenuProps,
) {
  const { currentStatusId, detailContext, locale, requirementId, variant } =
    props
  const t = useTranslations('requirement')
  const tc = useTranslations('common')
  const td = useTranslations('deviation')
  const [showReportMenu, setShowReportMenu] = useState(false)
  const reportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showReportMenu) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        reportMenuRef.current &&
        !reportMenuRef.current.contains(event.target as Node)
      ) {
        setShowReportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReportMenu])

  if (variant === 'specification' && props.deviationStep === 'draft') {
    return null
  }

  const openReport = (url: string) => {
    setShowReportMenu(false)
    window.open(url, '_blank')
  }

  const buttonMarker =
    variant === 'standalone'
      ? devMarker({
          context: detailContext,
          name: 'report print button',
          priority: 290,
          value: 'reports',
        })
      : devMarker({
          context: detailContext,
          name: 'report print button',
          priority: 290,
          value: 'specification reports',
        })

  return (
    <div className="relative" ref={reportMenuRef}>
      <button
        className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-[44px] min-w-[44px]"
        {...buttonMarker}
        onClick={() => setShowReportMenu(prev => !prev)}
        title={tc('print')}
        type="button"
      >
        <Printer aria-hidden="true" className="h-4 w-4" />
        {tc('print')}
      </button>
      {showReportMenu && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-white dark:bg-secondary-800 shadow-lg py-1">
          {variant === 'specification' ? (
            props.deviationStep === 'review_requested' ? (
              <>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 295,
                    value: 'print deviation review',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/print/deviation-review/${requirementId}?pkg=${props.specificationSlug}&item=${props.specificationItemId}`,
                    )
                  }
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {td('printDeviationReviewReport')}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 296,
                    value: 'download deviation review pdf',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/pdf/deviation-review/${requirementId}?pkg=${props.specificationSlug}&item=${props.specificationItemId}`,
                    )
                  }
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {td('downloadDeviationReviewReportPdf')}
                </button>
              </>
            ) : (
              <>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 295,
                    value: 'print history',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/print/history/${requirementId}`,
                    )
                  }
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('printHistoryReport')}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 296,
                    value: 'download history pdf',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                    )
                  }
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('downloadHistoryReportPdf')}
                </button>
                <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 299,
                    value: 'print suggestion history',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/print/suggestion-history/${requirementId}`,
                    )
                  }
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('printSuggestionHistoryReport')}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 300,
                    value: 'download suggestion history pdf',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                    )
                  }
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('downloadSuggestionHistoryReportPdf')}
                </button>
              </>
            )
          ) : (
            <>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 295,
                  value: 'print history',
                })}
                onClick={() =>
                  openReport(
                    `/${locale}/requirements/reports/print/history/${requirementId}`,
                  )
                }
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('printHistoryReport')}
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 296,
                  value: 'download history pdf',
                })}
                onClick={() =>
                  openReport(
                    `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                  )
                }
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('downloadHistoryReportPdf')}
              </button>
              <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 299,
                  value: 'print suggestion history',
                })}
                onClick={() =>
                  openReport(
                    `/${locale}/requirements/reports/print/suggestion-history/${requirementId}`,
                  )
                }
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('printSuggestionHistoryReport')}
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 300,
                  value: 'download suggestion history pdf',
                })}
                onClick={() =>
                  openReport(
                    `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                  )
                }
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('downloadSuggestionHistoryReportPdf')}
              </button>
              {currentStatusId === STATUS_REVIEW && (
                <>
                  <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                    {...devMarker({
                      context: detailContext,
                      name: 'report option',
                      priority: 297,
                      value: 'print review',
                    })}
                    onClick={() =>
                      openReport(
                        `/${locale}/requirements/reports/print/review/${requirementId}`,
                      )
                    }
                    type="button"
                  >
                    <Printer aria-hidden="true" className="h-4 w-4" />
                    {t('printReviewReport')}
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                    {...devMarker({
                      context: detailContext,
                      name: 'report option',
                      priority: 298,
                      value: 'download review pdf',
                    })}
                    onClick={() =>
                      openReport(
                        `/${locale}/requirements/reports/pdf/review/${requirementId}`,
                      )
                    }
                    type="button"
                  >
                    <Printer aria-hidden="true" className="h-4 w-4" />
                    {t('downloadReviewReportPdf')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
