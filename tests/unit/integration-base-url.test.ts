import type { TestInfo } from '@playwright/test'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveIntegrationBaseUrl } from '@/tests/integration/base-url'

const originalBaseUrl = process.env.PLAYWRIGHT_BASE_URL

function testInfoWithBaseUrl(baseURL?: unknown): TestInfo {
  return {
    project: {
      use: baseURL === undefined ? {} : { baseURL },
    },
  } as TestInfo
}

describe('integration base URL helper', () => {
  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.PLAYWRIGHT_BASE_URL
    } else {
      process.env.PLAYWRIGHT_BASE_URL = originalBaseUrl
    }
  })

  it('resolves project base URL before env and fallback', () => {
    process.env.PLAYWRIGHT_BASE_URL = 'https://env.example/'

    expect(
      resolveIntegrationBaseUrl(
        testInfoWithBaseUrl('https://project.example/'),
      ),
    ).toBe('https://project.example/')

    expect(resolveIntegrationBaseUrl(testInfoWithBaseUrl())).toBe(
      'https://env.example/',
    )

    delete process.env.PLAYWRIGHT_BASE_URL
    expect(resolveIntegrationBaseUrl(testInfoWithBaseUrl())).toBe(
      'http://localhost:3000',
    )
  })

  it('supports caller-specific fallback and trailing slash normalization', () => {
    process.env.PLAYWRIGHT_BASE_URL = 'https://env.example/'

    expect(
      resolveIntegrationBaseUrl(testInfoWithBaseUrl(), {
        fallback: 'http://localhost:3001',
        stripTrailingSlash: true,
      }),
    ).toBe('https://env.example')

    delete process.env.PLAYWRIGHT_BASE_URL
    expect(
      resolveIntegrationBaseUrl(testInfoWithBaseUrl(), {
        fallback: 'http://localhost:3001',
        stripTrailingSlash: true,
      }),
    ).toBe('http://localhost:3001')
  })
})
