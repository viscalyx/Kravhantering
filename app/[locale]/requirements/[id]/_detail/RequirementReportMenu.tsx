'use client'

import { Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from '@/components/primitives/AppMenu'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
import { devMarker } from '@/lib/developer-mode-markers'
import { STATUS_REVIEW } from '@/lib/requirements/status-constants.mjs'
import type { DeviationStep } from './types'

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
      specificationId: number
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
  const pdfDownload = useServerPdfDownload()

  if (variant === 'specification' && props.deviationStep === 'draft') {
    return null
  }

  const downloadPdf = (url: string, fallbackFilename: string) => {
    void pdfDownload.download({ fallbackFilename, url })
  }

  const buttonMarker =
    variant === 'standalone'
      ? devMarker({
          context: detailContext,
          name: 'report button',
          priority: 290,
          value: 'reports',
        })
      : devMarker({
          context: detailContext,
          name: 'report button',
          priority: 290,
          value: 'specification reports',
        })

  return (
    <AppMenu onOpenChange={setShowReportMenu} open={showReportMenu}>
      <AppMenuTrigger>
        <button
          className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11"
          {...buttonMarker}
          title={tc('reports')}
          type="button"
        >
          <Printer aria-hidden="true" className="h-4 w-4" />
          {tc('reports')}
        </button>
      </AppMenuTrigger>
      <AppMenuContent
        align="end"
        className="z-50 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-secondary-200 bg-white py-1 text-secondary-900 shadow-lg dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-100"
        sideOffset={4}
      >
        {variant === 'specification' ? (
          props.deviationStep === 'review_requested' ? (
            <AppMenuItem
              className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
              {...devMarker({
                context: detailContext,
                name: 'report option',
                priority: 296,
                value: 'deviation review report',
              })}
              onAction={() =>
                downloadPdf(
                  `/${locale}/requirements/reports/pdf/deviation-review/${requirementId}?spec=${props.specificationId}&item=${props.specificationItemId}`,
                  `deviation-review-report-${requirementId}.pdf`,
                )
              }
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              {td('downloadDeviationReviewReportPdf')}
            </AppMenuItem>
          ) : (
            <>
              <AppMenuItem
                className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 296,
                  value: 'history report',
                })}
                onAction={() =>
                  downloadPdf(
                    `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                    `history-report-${requirementId}.pdf`,
                  )
                }
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('downloadHistoryReportPdf')}
              </AppMenuItem>
              <AppMenuSeparator className="my-1 h-px bg-secondary-200 dark:bg-secondary-700" />
              <AppMenuItem
                className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 300,
                  value: 'suggestion history report',
                })}
                onAction={() =>
                  downloadPdf(
                    `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                    `suggestion-history-report-${requirementId}.pdf`,
                  )
                }
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('downloadSuggestionHistoryReportPdf')}
              </AppMenuItem>
            </>
          )
        ) : (
          <>
            <AppMenuItem
              className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
              {...devMarker({
                context: detailContext,
                name: 'report option',
                priority: 296,
                value: 'history report',
              })}
              onAction={() =>
                downloadPdf(
                  `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                  `history-report-${requirementId}.pdf`,
                )
              }
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              {t('downloadHistoryReportPdf')}
            </AppMenuItem>
            <AppMenuSeparator className="my-1 h-px bg-secondary-200 dark:bg-secondary-700" />
            <AppMenuItem
              className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
              {...devMarker({
                context: detailContext,
                name: 'report option',
                priority: 300,
                value: 'suggestion history report',
              })}
              onAction={() =>
                downloadPdf(
                  `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                  `suggestion-history-report-${requirementId}.pdf`,
                )
              }
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              {t('downloadSuggestionHistoryReportPdf')}
            </AppMenuItem>
            {currentStatusId === STATUS_REVIEW && (
              <>
                <AppMenuSeparator className="my-1 h-px bg-secondary-200 dark:bg-secondary-700" />
                <AppMenuItem
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 298,
                    value: 'review report',
                  })}
                  onAction={() =>
                    downloadPdf(
                      `/${locale}/requirements/reports/pdf/review/${requirementId}`,
                      `review-report-${requirementId}.pdf`,
                    )
                  }
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('downloadReviewReportPdf')}
                </AppMenuItem>
              </>
            )}
          </>
        )}
      </AppMenuContent>
      {pdfDownload.dialog}
    </AppMenu>
  )
}
