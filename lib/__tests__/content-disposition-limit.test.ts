import { beforeEach, describe, expect, it, vi } from 'vitest'
import { csvContentDisposition } from '@/lib/http/content-disposition'

const dispositionState = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('content-disposition', () => ({
  create: dispositionState.create,
}))

describe('Content-Disposition header limit', () => {
  beforeEach(() => {
    dispositionState.create.mockReset()
  })

  it('falls back to a static filename when the generated header is oversized', () => {
    dispositionState.create
      .mockReturnValueOnce('x'.repeat(2049))
      .mockReturnValueOnce('attachment; filename=export.csv')

    expect(csvContentDisposition('Requirements.csv')).toBe(
      'attachment; filename=export.csv',
    )
    expect(dispositionState.create).toHaveBeenNthCalledWith(
      1,
      'Requirements.csv',
      { fallback: 'Requirements.csv' },
    )
    expect(dispositionState.create).toHaveBeenNthCalledWith(2, 'export.csv')
  })
})
