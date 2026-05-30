import { createElement } from 'react'
import PdfReportRenderer from '@/components/reports/pdf/PdfReportRenderer'
import { renderPdfResponse } from '@/lib/pdf/server-response'
import type { ReportModel } from '@/lib/reports/types'

export function renderReportModelPdfResponse(
  model: ReportModel,
  locale: string,
  filename: string,
): Promise<Response> {
  return renderPdfResponse(
    createElement(PdfReportRenderer, { locale, model }),
    filename,
  )
}
