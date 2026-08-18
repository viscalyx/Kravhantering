import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'
import type { ReportModel } from '@/lib/reports/types'

export interface PdfReportWorkerData {
  document?: undefined
  locale: string
  maxBytes: number
  model: ReportModel
  outputPath: string
}

export interface DataSubjectExportPdfWorkerData {
  document: {
    exportData: DataSubjectExportV1
    kind: 'data-subject-export'
    locale: string
  }
  maxBytes: number
  outputPath: string
}

export type PdfWorkerData = DataSubjectExportPdfWorkerData | PdfReportWorkerData

export function isDataSubjectExportPdfWorkerData(
  data: PdfWorkerData,
): data is DataSubjectExportPdfWorkerData {
  return data.document?.kind === 'data-subject-export'
}

export type PdfReportWorkerMessage =
  | { byteCount: number; ok: true }
  | { failure: 'byte_limit' | 'storage'; ok: false }
