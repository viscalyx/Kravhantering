'use client'

import { Printer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
import { devMarker } from '@/lib/developer-mode-markers'
import { STATUS_REVIEW } from '@/lib/requirements/status-constants.mjs'
import type { DeviationStep } from './types'
import { useDetailActionMenu } from './useDetailActionMenu'

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
  const pdfDownload = useServerPdfDownload()
  const reportMenu = useDetailActionMenu({
    idPrefix: 'requirement-report-menu',
    isOpen: showReportMenu,
    setIsOpen: setShowReportMenu,
  })

  if (variant === 'specification' && props.deviationStep === 'draft') {
    return null
  }

  const openReport = (url: string) => {
    reportMenu.closeMenu({ restoreFocus: true })
    window.open(url, '_blank')
  }

  const downloadPdf = (url: string, fallbackFilename: string) => {
    reportMenu.closeMenu({ restoreFocus: true })
    void pdfDownload.download({ fallbackFilename, url })
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
    <div className="relative" ref={reportMenu.rootRef}>
      <button
        aria-controls={reportMenu.menuId}
        aria-expanded={showReportMenu}
        aria-haspopup="menu"
        className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center min-h-11 min-w-11"
        {...buttonMarker}
        id={reportMenu.triggerId}
        onClick={() => setShowReportMenu(prev => !prev)}
        ref={reportMenu.triggerRef}
        title={tc('print')}
        type="button"
      >
        <Printer aria-hidden="true" className="h-4 w-4" />
        {tc('print')}
      </button>
      {showReportMenu && (
        <div
          aria-labelledby={reportMenu.triggerId}
          className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-white dark:bg-secondary-800 shadow-lg py-1"
          id={reportMenu.menuId}
          onKeyDown={reportMenu.handleMenuKeyDown}
          ref={reportMenu.menuRef}
          role="menu"
        >
          {variant === 'specification' ? (
            props.deviationStep === 'review_requested' ? (
              <>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 295,
                    value: 'print deviation review',
                  })}
                  onClick={() =>
                    openReport(
                      `/${locale}/requirements/reports/print/deviation-review/${requirementId}?spec=${props.specificationSlug}&item=${props.specificationItemId}`,
                    )
                  }
                  role="menuitem"
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {td('printDeviationReviewReport')}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 296,
                    value: 'download deviation review pdf',
                  })}
                  onClick={() =>
                    downloadPdf(
                      `/${locale}/requirements/reports/pdf/deviation-review/${requirementId}?spec=${props.specificationSlug}&item=${props.specificationItemId}`,
                      `deviation-review-report-${requirementId}.pdf`,
                    )
                  }
                  role="menuitem"
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {td('downloadDeviationReviewReportPdf')}
                </button>
              </>
            ) : (
              <>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
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
                  role="menuitem"
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('printHistoryReport')}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 296,
                    value: 'download history pdf',
                  })}
                  onClick={() =>
                    downloadPdf(
                      `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                      `history-report-${requirementId}.pdf`,
                    )
                  }
                  role="menuitem"
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('downloadHistoryReportPdf')}
                </button>
                <hr className="my-1 border-0 border-t border-secondary-200 dark:border-secondary-700" />
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
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
                  role="menuitem"
                  type="button"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  {t('printSuggestionHistoryReport')}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                  {...devMarker({
                    context: detailContext,
                    name: 'report option',
                    priority: 300,
                    value: 'download suggestion history pdf',
                  })}
                  onClick={() =>
                    downloadPdf(
                      `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                      `suggestion-history-report-${requirementId}.pdf`,
                    )
                  }
                  role="menuitem"
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
                className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
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
                role="menuitem"
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('printHistoryReport')}
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 296,
                  value: 'download history pdf',
                })}
                onClick={() =>
                  downloadPdf(
                    `/${locale}/requirements/reports/pdf/history/${requirementId}`,
                    `history-report-${requirementId}.pdf`,
                  )
                }
                role="menuitem"
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('downloadHistoryReportPdf')}
              </button>
              <hr className="my-1 border-0 border-t border-secondary-200 dark:border-secondary-700" />
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
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
                role="menuitem"
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('printSuggestionHistoryReport')}
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                {...devMarker({
                  context: detailContext,
                  name: 'report option',
                  priority: 300,
                  value: 'download suggestion history pdf',
                })}
                onClick={() =>
                  downloadPdf(
                    `/${locale}/requirements/reports/pdf/suggestion-history/${requirementId}`,
                    `suggestion-history-report-${requirementId}.pdf`,
                  )
                }
                role="menuitem"
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t('downloadSuggestionHistoryReportPdf')}
              </button>
              {currentStatusId === STATUS_REVIEW && (
                <>
                  <hr className="my-1 border-0 border-t border-secondary-200 dark:border-secondary-700" />
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
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
                    role="menuitem"
                    type="button"
                  >
                    <Printer aria-hidden="true" className="h-4 w-4" />
                    {t('printReviewReport')}
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 min-h-11 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                    {...devMarker({
                      context: detailContext,
                      name: 'report option',
                      priority: 298,
                      value: 'download review pdf',
                    })}
                    onClick={() =>
                      downloadPdf(
                        `/${locale}/requirements/reports/pdf/review/${requirementId}`,
                        `review-report-${requirementId}.pdf`,
                      )
                    }
                    role="menuitem"
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
      {pdfDownload.dialog}
    </div>
  )
}
