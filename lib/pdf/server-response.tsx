import { renderToBuffer } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import type { GeneratedOutputCapacity } from '@/lib/generated-output/capacity'
import { pdfContentDisposition } from '@/lib/http/content-disposition'

interface PdfResponseOptions {
  capacity: GeneratedOutputCapacity
  headers?: HeadersInit
  status?: number
}

export async function renderPdfResponse(
  document: ReactElement,
  filename: string,
  options: PdfResponseOptions,
): Promise<Response> {
  if (options.capacity.output !== 'pdf' || !options.capacity.isActive()) {
    throw new Error('Active PDF generation capacity is required')
  }
  const buffer = await renderToBuffer(
    document as ReactElement<import('@react-pdf/renderer').DocumentProps>,
  )
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', pdfContentDisposition(filename))
  headers.set('Cache-Control', 'no-store')

  return new Response(buffer as unknown as BodyInit, {
    headers,
    status: options.status ?? 200,
  })
}
