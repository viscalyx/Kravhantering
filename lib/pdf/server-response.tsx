import { renderToBuffer } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { pdfContentDisposition } from '@/lib/pdf/filename'

interface PdfResponseOptions {
  headers?: HeadersInit
  status?: number
}

export async function renderPdfResponse(
  document: ReactElement,
  filename: string,
  options: PdfResponseOptions = {},
): Promise<Response> {
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
