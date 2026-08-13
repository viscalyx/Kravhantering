import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireGeneratedOutputCapacity,
  generatedOutputCapacitySnapshot,
} from '@/lib/generated-output/capacity'
import { ClientCancelledGeneratedOutputError } from '@/lib/generated-output/operation'
import { runSynchronousPdfGeneration } from '@/lib/pdf/synchronous-generation'

const mocks = vi.hoisted(() => ({
  getApplicationSettings: vi.fn(),
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: mocks.getApplicationSettings,
}))

describe('synchronous PDF generation utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getApplicationSettings.mockResolvedValue({
      pdfReportConcurrencyPerNode: 1,
      pdfReportMaxRequirements: 10,
      pdfReportTimeoutSeconds: 180,
    })
  })

  it('keeps cancelled work admitted until the abandoned render settles', async () => {
    const request = new AbortController()
    let finish: (() => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => {
      markStarted = resolve
    })
    const generation = runSynchronousPdfGeneration(
      {} as never,
      request.signal,
      () =>
        new Promise<Response>(resolve => {
          markStarted?.()
          finish = () => resolve(new Response('%PDF'))
        }),
    )

    await started
    request.abort()
    expect(generatedOutputCapacitySnapshot().activePdf).toBe(1)
    expect(() =>
      acquireGeneratedOutputCapacity({
        concurrencyLimit: 1,
        output: 'pdf',
      }),
    ).toThrow(expect.objectContaining({ code: 'capacity_busy' }))

    finish?.()
    await expect(generation).rejects.toBeInstanceOf(
      ClientCancelledGeneratedOutputError,
    )
    expect(generatedOutputCapacitySnapshot().activePdf).toBe(0)
  })
})
