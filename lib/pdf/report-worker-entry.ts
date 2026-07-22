import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { renderToStream } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import PdfReportRenderer from '@/components/reports/pdf/PdfReportRenderer'
import type { ReportModel } from '@/lib/reports/types'

interface PdfReportWorkerData {
  locale: string
  maxBytes: number
  model: ReportModel
  outputPath: string
}

type PdfReportWorkerMessage =
  | { byteCount: number; ok: true }
  | { failure: 'byte_limit' | 'storage'; ok: false }

class PdfByteLimitError extends Error {}

async function renderReport(): Promise<void> {
  const data = workerData as PdfReportWorkerData
  const document = createElement(PdfReportRenderer, {
    locale: data.locale,
    model: data.model,
  })

  const source = await renderToStream(
    document as ReactElement<import('@react-pdf/renderer').DocumentProps>,
  )
  let byteCount = 0
  const bounded = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (byteCount + chunk.byteLength > data.maxBytes) {
        callback(new PdfByteLimitError())
        return
      }
      byteCount += chunk.byteLength
      callback(null, chunk)
    },
  })
  const destination = createWriteStream(data.outputPath, {
    flags: 'w',
    mode: 0o600,
  })
  await pipeline(source, bounded, destination)

  const message: PdfReportWorkerMessage = { byteCount, ok: true }
  parentPort?.postMessage(message)
}

void renderReport().catch(error => {
  if (error instanceof PdfByteLimitError) {
    const message: PdfReportWorkerMessage = {
      failure: 'byte_limit',
      ok: false,
    }
    parentPort?.postMessage(message)
    return
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'ENOSPC' || error.code === 'EFBIG')
  ) {
    const message: PdfReportWorkerMessage = {
      failure: 'storage',
      ok: false,
    }
    parentPort?.postMessage(message)
    return
  }
  setImmediate(() => {
    throw error
  })
})
