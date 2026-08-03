import { createElement } from 'react'
import PdfReportRenderer from '@/components/reports/pdf/PdfReportRenderer'
import {
  collectStatusIconNames,
  preloadStatusIconNodes,
} from '@/lib/icons/status-icon-allowlist'
import { renderPdfResponse } from '@/lib/pdf/server-response'
import type { ReportModel } from '@/lib/reports/types'

export async function renderReportModelPdfResponse(
  model: ReportModel,
  locale: string,
  filename: string,
): Promise<Response> {
  await preloadStatusIconNodes(collectStatusIconNames(model))
  return renderPdfResponse(
    createElement(PdfReportRenderer, { locale, model }),
    filename,
  )
}
