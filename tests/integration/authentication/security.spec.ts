import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  type TestInfo,
  test,
} from '@playwright/test'
import {
  expectApiResponseOk,
  expectApiResponseStatus,
} from '../api-response-assertions'
import { resolveIntegrationBaseUrl } from '../base-url'

function getStorageState(testInfo: TestInfo) {
  return testInfo.project.use.storageState ?? 'test-results/auth/admin.json'
}

async function expectAnonymousTextAsset(
  request: APIRequestContext,
  path: string,
  contentType: RegExp,
  content: RegExp,
): Promise<string> {
  const response = await request.get(path)
  await expectApiResponseOk(response, `anonymous GET ${path}`)
  expect(response.headers()['content-type']).toMatch(contentType)

  const body = await response.text()
  expect(body).toMatch(content)
  return body
}

async function expectAnonymousPng(
  request: APIRequestContext,
  path: string,
): Promise<void> {
  const response = await request.get(path)
  await expectApiResponseOk(response, `anonymous GET ${path}`)
  expect(response.headers()['content-type']).toMatch(/^image\/png(?:;|$)/)

  const body = await response.body()
  expect([...body.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
}

test.describe('signed-out auth boundary', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const path of ['/sv/requirements', '/sv/requirements/policy.v2']) {
    test(`AUTH-02: browser navigation to ${path} reaches the login flow`, async ({
      page,
    }) => {
      await page.goto(path)

      await expect(page).toHaveURL(
        /\/api\/auth\/login|\/realms\/kravhantering-dev\/protocol\/openid-connect/,
      )
    })
  }

  test('AUTH-03: protected API requests return 401 JSON while auth/me stays a safe anonymous probe', async ({
    request,
  }) => {
    const meResponse = await request.get('/api/auth/me')
    await expectApiResponseStatus(meResponse, 200, 'anonymous auth projection')
    await expect(meResponse.json()).resolves.toEqual({
      authenticated: false,
    })

    const response = await request.get('/api/requirements')

    await expectApiResponseStatus(response, 401, 'anonymous requirements list')
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    })
  })

  test('AUTH-03: reviewed public assets and Next.js framework resources stay anonymous', async ({
    request,
  }) => {
    await test.step('serve reviewed application assets with their real content', async () => {
      const buildResponse = await request.get('/build.json')
      await expectApiResponseOk(buildResponse, 'anonymous GET build metadata')
      expect(buildResponse.headers()['content-type']).toMatch(
        /^application\/json(?:;|$)/,
      )
      await expect(buildResponse.json()).resolves.toMatchObject({
        builtAt: expect.any(String),
        commitSha: expect.any(String),
        expectedDatabaseSchemaVersion: expect.any(String),
        imageTag: expect.any(String),
        version: expect.any(String),
      })

      await expectAnonymousPng(request, '/logo-small.png')
      await expectAnonymousTextAsset(
        request,
        '/robots.txt',
        /^text\/plain(?:;|$)/,
        /Disallow:\s*\//,
      )
      await expectAnonymousTextAsset(
        request,
        '/sitemap.xml',
        /^(?:application|text)\/xml(?:;|$)/,
        /<urlset[\s>]/,
      )
    })

    await test.step('serve the generated Swagger UI assets anonymously', async () => {
      const swaggerBase = '/api-docs/hsa-person-lookup'
      const swaggerRootResponse = await request.get(`${swaggerBase}/`)
      await expectApiResponseOk(
        swaggerRootResponse,
        'anonymous GET Swagger UI root',
      )
      expect(swaggerRootResponse.url()).toBe(
        `${resolveIntegrationBaseUrl(test.info(), {
          stripTrailingSlash: true,
        })}${swaggerBase}/index.html`,
      )
      await expectAnonymousTextAsset(
        request,
        `${swaggerBase}/index.html`,
        /^text\/html(?:;|$)/,
        /id="swagger-ui"/,
      )
      await expectAnonymousTextAsset(
        request,
        `${swaggerBase}/hsa-person-lookup.yaml`,
        /^(?:application|text)\/(?:octet-stream|yaml|x-yaml|plain)(?:;|$)/,
        /title:\s*Kravhantering HSA Person Lookup Facade/,
      )
      await expectAnonymousTextAsset(
        request,
        `${swaggerBase}/swagger-ui-bundle.js`,
        /^(?:application|text)\/javascript(?:;|$)/,
        /SwaggerUIBundle/,
      )
      await expectAnonymousTextAsset(
        request,
        `${swaggerBase}/swagger-ui-standalone-preset.js`,
        /^(?:application|text)\/javascript(?:;|$)/,
        /SwaggerUIStandalonePreset/,
      )
      await expectAnonymousTextAsset(
        request,
        `${swaggerBase}/swagger-ui.css`,
        /^text\/css(?:;|$)/,
        /\.swagger-ui/,
      )
      await expectAnonymousPng(request, `${swaggerBase}/favicon-16x16.png`)
      await expectAnonymousPng(request, `${swaggerBase}/favicon-32x32.png`)
    })

    await test.step('load a real anonymous Next.js framework asset', async () => {
      const errorPageResponse = await request.get(
        '/auth/error?locale=sv&code=invalid_callback_request',
        { headers: { Accept: 'text/html' } },
      )
      await expectApiResponseOk(errorPageResponse, 'anonymous auth error page')
      const errorPageHtml = await errorPageResponse.text()
      const frameworkAssetPath = errorPageHtml.match(
        /["'](\/_next\/static\/[^"']+\.(?:css|js)(?:\?[^"']*)?)["']/,
      )?.[1]

      expect(frameworkAssetPath).toBeDefined()
      const frameworkResponse = await request.get(frameworkAssetPath as string)
      await expectApiResponseOk(
        frameworkResponse,
        `anonymous GET ${frameworkAssetPath}`,
      )
      expect(frameworkResponse.headers()['content-type']).toMatch(
        /^(?:application|text)\/(?:css|javascript)(?:;|$)/,
      )
      expect((await frameworkResponse.body()).byteLength).toBeGreaterThan(100)
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
  test('AUTH-02: authenticated dotted page paths receive proxy security processing', async ({
    page,
  }) => {
    const response = await page.goto('/sv/requirements/policy.v2')

    expect(response).not.toBeNull()
    await expect(page).toHaveURL(/\/sv\/requirements\/policy\.v2$/)

    const contentSecurityPolicy =
      response?.headers()['content-security-policy'] ?? ''
    expect(contentSecurityPolicy).toMatch(/script-src 'self' 'nonce-[^']+'/)
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'")
  })

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

    await expect(page).toHaveURL(
      /\/realms\/kravhantering-dev\/protocol\/openid-connect\/auth/,
    )

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
    await expectApiResponseStatus(response, 200, 'signed-in auth projection')

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

      await expectApiResponseStatus(
        response,
        403,
        'mutating REST request without X-Requested-With',
      )
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

      await expectApiResponseStatus(
        response,
        403,
        'cross-origin mutating REST request',
      )
      await expect(response.json()).resolves.toEqual({
        error: 'Forbidden',
        detail: 'Cross-origin request rejected.',
      })
    } finally {
      await context.dispose()
    }
  })
})
