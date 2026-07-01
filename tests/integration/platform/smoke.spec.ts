import { expect, test } from '@playwright/test'

function getBaseUrl(testInfo: { project: { use: { baseURL?: unknown } } }) {
  return String(
    testInfo.project.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://localhost:3000',
  )
}

test('RES-02: homepage loads for signed-in and signed-out sessions', async ({
  browser,
  page,
}, testInfo) => {
  const anonymousContext = await browser.newContext({
    baseURL: getBaseUrl(testInfo),
    storageState: { cookies: [], origins: [] },
  })
  const anonymousPage = await anonymousContext.newPage()
  await anonymousPage.goto('/')
  await expect(anonymousPage).toHaveTitle(/.+/)
  await anonymousContext.close()

  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
})

test('RES-03: readiness, build metadata, and navigation metadata are exposed safely', async ({
  page,
  request,
}) => {
  const readyResponse = await request.get('/api/ready')
  expect([200, 503]).toContain(readyResponse.status())
  const readyBody = (await readyResponse.json()) as Record<string, unknown>
  expect(readyBody.status).toMatch(/^(ready|not_ready)$/)
  expect(JSON.stringify(readyBody.failedChecks ?? {})).not.toMatch(
    /token|secret|password/i,
  )

  const buildResponse = await request.get('/build.json')
  expect(buildResponse.ok()).toBe(true)
  const buildBody = (await buildResponse.json()) as Record<string, unknown>
  expect(buildBody).toMatchObject({
    builtAt: expect.any(String),
    commitSha: expect.any(String),
    expectedDatabaseSchemaVersion: expect.any(String),
    imageTag: expect.any(String),
    version: expect.any(String),
  })
  expect(JSON.stringify(buildBody)).not.toMatch(/token|secret|password/i)

  await page.goto('/sv/requirements')
  await expect(
    page
      .locator('[data-global-navigation-rail="desktop"]')
      .getByRole('link', { name: 'Kravhantering' }),
  ).toHaveAttribute('title', /Appversion:/)
})
