import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultUiTerminology } from '@/lib/ui-terminology'

const {
  applyUiTerminologyMessagesMock,
  getRequestDatabaseMock,
  getUiTerminologyMock,
} = vi.hoisted(() => ({
  applyUiTerminologyMessagesMock: vi.fn(baseMessages => ({
    ...baseMessages,
    __dbTerminologyApplied: true,
  })),
  getRequestDatabaseMock: vi.fn(),
  getUiTerminologyMock: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: unknown) => factory,
}))

vi.mock('@/i18n/routing', () => ({
  routing: {
    defaultLocale: 'sv',
    locales: ['sv', 'en'],
  },
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabase: getRequestDatabaseMock,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  getUiTerminology: getUiTerminologyMock,
}))

vi.mock('@/lib/ui-terminology', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ui-terminology')>(
    '@/lib/ui-terminology',
  )

  return {
    ...actual,
    applyUiTerminologyMessages: applyUiTerminologyMessagesMock,
  }
})

describe('i18n request config', () => {
  beforeEach(() => {
    vi.resetModules()
    applyUiTerminologyMessagesMock.mockReset()
    applyUiTerminologyMessagesMock.mockImplementation(baseMessages => ({
      ...baseMessages,
      __dbTerminologyApplied: true,
    }))
    getRequestDatabaseMock.mockReset()
    getUiTerminologyMock.mockReset()
    delete (globalThis as { EdgeRuntime?: string }).EdgeRuntime
  })

  it('loads database-backed terminology instead of falling back to static messages', async () => {
    const terminology = getDefaultUiTerminology()
    getRequestDatabaseMock.mockResolvedValueOnce({})
    getUiTerminologyMock.mockResolvedValueOnce(terminology)

    const getRequestConfig = (await import('@/i18n/request')).default as ({
      requestLocale,
    }: {
      requestLocale: Promise<string>
    }) => Promise<{ locale: string; messages: Record<string, unknown> }>

    const result = await getRequestConfig({
      requestLocale: Promise.resolve('en'),
    })

    expect(result.locale).toBe('en')
    expect(applyUiTerminologyMessagesMock).toHaveBeenCalledWith(
      expect.any(Object),
      'en',
      terminology,
    )
    expect(result.messages.__dbTerminologyApplied).toBe(true)
  })

  it('fails when database-backed terminology cannot be loaded', async () => {
    getRequestDatabaseMock.mockRejectedValueOnce(new Error('db unavailable'))

    const getRequestConfig = (await import('@/i18n/request')).default as ({
      requestLocale,
    }: {
      requestLocale: Promise<string>
    }) => Promise<{ locale: string; messages: Record<string, unknown> }>

    await expect(
      getRequestConfig({ requestLocale: Promise.resolve('en') }),
    ).rejects.toThrow('db unavailable')
  })
})
