import { expect, test } from '@playwright/test'
import {
  expectApiResponseOk,
  expectApiResponseStatus,
} from '../api-response-assertions'
import { resolveIntegrationBaseUrl } from '../base-url'

test('RES-02: homepage loads for signed-in and signed-out sessions', async ({
  browser,
  page,
}, testInfo) => {
  const anonymousContext = await browser.newContext({
    baseURL: resolveIntegrationBaseUrl(testInfo),
    storageState: { cookies: [], origins: [] },
  })
  try {
    const anonymousPage = await anonymousContext.newPage()
    await anonymousPage.goto('/')
    await expect(anonymousPage).toHaveTitle(/.+/)
  } finally {
    await anonymousContext.close()
  }

  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
})

test('RES-03: readiness, build metadata, and navigation metadata are exposed safely', async ({
  page,
  request,
}) => {
  const readyResponse = await request.get('/api/ready')
  expect([200, 503]).toContain(readyResponse.status())
  const readyBody = (await readyResponse.json()) as {
    failedChecks?: Array<{ name?: string; reason?: string }>
    status?: string
  }
  expect(readyBody.status).toMatch(/^(ready|not_ready)$/)
  expect(JSON.stringify(readyBody.failedChecks ?? {})).not.toMatch(
    /token|secret|password/i,
  )

  const buildResponse = await request.get('/build.json')
  await expectApiResponseOk(buildResponse, 'GET build metadata')
  const buildBody = (await buildResponse.json()) as Record<string, unknown>
  expect(buildBody).toMatchObject({
    builtAt: expect.any(String),
    commitSha: expect.any(String),
    expectedDatabaseSchemaVersion: expect.any(String),
    imageTag: expect.any(String),
    version: expect.any(String),
  })
  expect(JSON.stringify(buildBody)).not.toMatch(/token|secret|password/i)

  const schemaResponse = await request.get('/api/database-schema-status')
  expect([200, 503]).toContain(schemaResponse.status())
  const schemaBody = (await schemaResponse.json()) as {
    expectedDatabaseSchemaVersion?: string | null
    reason?: string
    status?: string
  }
  expect(schemaBody.expectedDatabaseSchemaVersion).toBe(
    buildBody.expectedDatabaseSchemaVersion,
  )
  if (readyBody.status === 'ready') {
    await expectApiResponseStatus(readyResponse, 200, 'ready endpoint')
    expect(schemaBody.status).toBe('matches')
  } else {
    await expectApiResponseStatus(readyResponse, 503, 'ready endpoint')
    const schemaFailure = readyBody.failedChecks?.find(
      check => check.name === 'database_migration_compatibility',
    )
    if (schemaFailure) {
      expect(schemaBody.status).not.toBe('matches')
      expect(schemaBody.reason).toBe(schemaFailure.reason)
    }
  }

  await page.goto('/sv/requirements')
  await expect(
    page
      .locator('[data-global-navigation-rail="desktop"]')
      .getByRole('link', { name: 'Kravhantering' }),
  ).toHaveAttribute('title', /Appversion:/)
})
