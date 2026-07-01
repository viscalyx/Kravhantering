import { expect, test } from '@playwright/test'

test('RES-02: homepage loads', async ({ page }) => {
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
