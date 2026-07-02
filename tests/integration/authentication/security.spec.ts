import {
  expect,
  request as playwrightRequest,
  type TestInfo,
  test,
} from '@playwright/test'
import { resolveIntegrationBaseUrl } from '../base-url'

function getStorageState(testInfo: TestInfo) {
  return testInfo.project.use.storageState ?? 'test-results/auth/admin.json'
}

test.describe('signed-out auth boundary', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('AUTH-02: browser navigation reaches the login flow', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    await expect(page).toHaveURL(
      /\/api\/auth\/login|\/realms\/kravhantering-dev\/protocol\/openid-connect/,
    )
  })

  test('AUTH-03: protected API requests return 401 JSON while auth/me stays a safe anonymous probe', async ({
    request,
  }) => {
    const meResponse = await request.get('/api/auth/me')
    expect(meResponse.status()).toBe(200)
    await expect(meResponse.json()).resolves.toEqual({
      authenticated: false,
    })

    const response = await request.get('/api/requirements')

    expect(response.status()).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    })
  })

  test('AUTH-09: invalid auth callback shows an error and leaves protected routes signed out', async ({
    page,
  }) => {
    await page.goto('/auth/error?locale=sv&code=invalid_callback_request')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Inloggningen kunde inte slutföras',
      }),
    ).toContainText('Inloggningen kunde inte slutföras')
    await expect(page.getByText('invalid_callback_request')).toContainText(
      'invalid_callback_request',
    )
    await expect(
      page.getByRole('link', { name: 'Försök logga in igen' }),
    ).toHaveAttribute('href', /\/api\/auth\/login/)

    await page.goto('/sv/requirements')
    await expect(page).toHaveURL(
      /\/api\/auth\/login|\/realms\/kravhantering-dev\/protocol\/openid-connect/,
    )
  })
})

test.describe('signed-in auth boundary', () => {
  test('AUTH-02: logout from Admincenter removes access before reopening protected pages', async ({
    page,
  }) => {
    await page.goto('/sv/admin')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Administrationscenter' }),
    ).toBeVisible()

    const userMenuButton = page.getByRole('button', {
      name: /^Inloggad som /,
    })
    await userMenuButton.hover()
    const userInfoDialog = page.getByRole('dialog', {
      name: 'Kontouppgifter',
    })
    await expect(userInfoDialog).toBeVisible()
    await userInfoDialog.getByRole('button', { name: 'Logga ut' }).click()

    await expect
      .poll(async () => {
        const response = await page.request.get('/api/auth/me')
        return response.json()
      })
      .toEqual({ authenticated: false })

    await page.goto('/sv/requirements')
    await expect(page).toHaveURL(
      /\/api\/auth\/login|\/realms\/kravhantering-dev\/protocol\/openid-connect/,
    )
  })

  test('AUTH-04: auth/me returns only the safe session projection', async ({
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

  test('AUTH-12: mutating REST requests without X-Requested-With are rejected', async ({
    request: _request,
  }, testInfo) => {
    const baseURL = resolveIntegrationBaseUrl(testInfo)
    const context = await playwrightRequest.newContext({
      baseURL,
      storageState: getStorageState(testInfo),
    })

    try {
      const response = await context.post('/api/requirement-areas', {
        data: {
          name: 'No CSRF',
          ownerHsaId: 'SE5560000001-1001',
          prefix: 'NOC',
        },
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

  test('AUTH-12: cross-origin mutating REST requests are rejected', async ({
    request: _request,
  }, testInfo) => {
    const context = await playwrightRequest.newContext({
      baseURL: resolveIntegrationBaseUrl(testInfo),
      storageState: getStorageState(testInfo),
    })

    try {
      const response = await context.post('/api/requirement-areas', {
        data: {
          name: 'Cross Site',
          ownerHsaId: 'SE5560000001-cross1',
          prefix: 'CRS',
        },
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
