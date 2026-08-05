import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

describe('root layout environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('fails fast when the public site URL is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')

    await expect(import('@/app/layout')).rejects.toThrow(
      'NEXT_PUBLIC_SITE_URL is not set',
    )
  })
})
