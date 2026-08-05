import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  formatUiSettingsLoadError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
  getRequestSqlServerDataSource: vi.fn(),
  getVisibleHsaIdPrefixes: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  formatUiSettingsLoadError: routeState.formatUiSettingsLoadError,
  getVisibleHsaIdPrefixes: routeState.getVisibleHsaIdPrefixes,
}))

import { GET } from '@/app/api/hsa-id-prefixes/route'

describe('visible HSA-id prefixes route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({ db: true })
  })

  it('returns the visible prefixes', async () => {
    routeState.getVisibleHsaIdPrefixes.mockResolvedValue([
      { label: 'Demo', prefix: 'SE5560000001' },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      prefixes: [{ label: 'Demo', prefix: 'SE5560000001' }],
    })
    expect(routeState.getVisibleHsaIdPrefixes).toHaveBeenCalledWith({
      db: true,
    })
  })

  it('returns a stable error without exposing the database failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.getRequestSqlServerDataSource.mockRejectedValue(
      new Error('database password leaked'),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load HSA-id prefixes.',
    })
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load visible HSA-id prefixes',
      { message: 'database password leaked' },
    )
  })
})
