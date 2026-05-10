import {
  expect,
  request as playwrightRequest,
  type TestInfo,
  test,
} from '@playwright/test'

function getBaseUrl(testInfo: TestInfo): string {
  return String(
    testInfo.project.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://localhost:3000',
  )
}

function getStorageState(testInfo: TestInfo) {
  return testInfo.project.use.storageState ?? 'test-results/auth/admin.json'
}

test.describe('signed-out auth boundary', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('browser navigation reaches the login flow', async ({ page }) => {
    await page.goto('/sv/requirements')

    await expect(page).toHaveURL(
      /\/api\/auth\/login|\/realms\/kravhantering-dev\/protocol\/openid-connect/,
    )
  })

  test('API requests return 401 JSON', async ({ request }) => {
    const response = await request.get('/api/requirements')

    expect(response.status()).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    })
  })
})

test.describe('signed-in auth boundary', () => {
  test('auth/me returns only the safe session projection', async ({
    request,
  }) => {
    const response = await request.get('/api/auth/me')
    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      authenticated: true,
      sub: expect.any(String),
      hsaId: expect.any(String),
      givenName: expect.any(String),
      familyName: expect.any(String),
      name: expect.any(String),
      roles: expect.any(Array),
      expiresAt: expect.any(Number),
    })
    for (const key of [
      'accessToken',
      'authorizationCode',
      'code',
      'codeVerifier',
      'idToken',
      'nonce',
      'refreshToken',
      'state',
    ]) {
      expect(body).not.toHaveProperty(key)
    }
  })

  test('mutating REST requests without X-Requested-With are rejected', async ({
    request: _request,
  }, testInfo) => {
    const baseURL = getBaseUrl(testInfo)
    const context = await playwrightRequest.newContext({
      baseURL,
      storageState: getStorageState(testInfo),
    })

    try {
      const response = await context.post('/api/owners', {
        data: { firstName: 'No', lastName: 'Csrf' },
        headers: {
          Origin: new URL(baseURL).origin,
          'X-Requested-With': '',
        },
      })

      expect(response.status()).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: 'Forbidden',
        detail: 'Missing X-Requested-With header.',
      })
    } finally {
      await context.dispose()
    }
  })

  test('cross-origin mutating REST requests are rejected', async ({
    request: _request,
  }, testInfo) => {
    const context = await playwrightRequest.newContext({
      baseURL: getBaseUrl(testInfo),
      storageState: getStorageState(testInfo),
    })

    try {
      const response = await context.post('/api/owners', {
        data: { firstName: 'Cross', lastName: 'Site' },
        headers: {
          Origin: 'https://evil.example',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      expect(response.status()).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: 'Forbidden',
        detail: 'Cross-origin request rejected.',
      })
    } finally {
      await context.dispose()
    }
  })
})
