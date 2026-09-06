import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { escapeRegExp } from '@/tests/helpers/common'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'
import {
  type AuthorizationFixture,
  createAuthorizationFixture,
  expectOk,
  type RequirementListResponse,
  ROLE_STORAGE_STATE,
  referenceManualCases,
} from './authorization-test-helpers'

let fixture: AuthorizationFixture

const specificationNavigationTimeoutMs = 45_000
const diagnosticBodyPreviewLength = 2_000

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
  fixture = await createAuthorizationFixture(testInfo)
})

test.describe('AUTHZ-00/AUTH-11: authorization fixture seed', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.admin,
    viewport: DESKTOP_VIEWPORT,
  })
  test.setTimeout(120_000)

  test('AUTHZ-00/AUTH-11: seeded AUTHZ objects and identities are visible', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-00', 'AUTH-11')

    await test.step('verify the admin page is visible', async () => {
      await page.goto('/sv/admin')
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Administrationscenter',
        }),
      ).toBeVisible()
    })

    await test.step('verify the seeded specification is visible', async () => {
      await gotoSeededSpecification(page, testInfo)
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: fixture.specificationName,
        }),
      ).toBeVisible()
    })

    await test.step('verify the seeded requirement area is visible', async () => {
      await page.goto('/sv/requirement-areas')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravområden' }),
      ).toBeVisible()
      await expect(
        page.getByRole('row', {
          name: new RegExp(escapeRegExp(fixture.areaPrefix)),
        }),
      ).toBeVisible()
    })

    await test.step('verify the seeded requirement package is visible', async () => {
      await page.goto('/sv/requirements/stewardship?tab=packages')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
      ).toBeVisible()
      await page
        .getByRole('textbox', { name: 'Filtrera på namn eller beskrivning' })
        .fill(fixture.packageName)
      await expect(
        page.getByRole('row', {
          name: new RegExp(escapeRegExp(fixture.packageName)),
        }),
      ).toBeVisible()
    })
  })
})

function errorSummary(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) }
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack ?? null,
  }
}

function compactText(value: string) {
  return value.length <= diagnosticBodyPreviewLength
    ? value
    : `${value.slice(0, diagnosticBodyPreviewLength)}\n... truncated ${value.length - diagnosticBodyPreviewLength} chars`
}

async function attachSpecificationNavigationDiagnostics(
  page: Page,
  testInfo: TestInfo,
  path: string,
  startedAt: number,
  error: unknown,
) {
  const diagnostics: Record<string, unknown> = {
    currentUrl: page.url(),
    elapsedMs: Date.now() - startedAt,
    environment: {
      baseURL: testInfo.project.use.baseURL ?? null,
      ci: process.env.CI ?? null,
      playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL ?? null,
      playwrightNavigationTimeout:
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT ?? null,
      playwrightSkipWebserver: process.env.PLAYWRIGHT_SKIP_WEBSERVER ?? null,
    },
    error: errorSummary(error),
    targetPath: path,
    test: {
      projectName: testInfo.project.name,
      retry: testInfo.retry,
      titlePath: testInfo.titlePath,
      workerIndex: testInfo.workerIndex,
    },
    timeoutMs: specificationNavigationTimeoutMs,
  }

  try {
    const responseStartedAt = Date.now()
    const response = await page.request.get(path, { timeout: 30_000 })
    diagnostics.followUpGet = {
      bodyPreview: compactText(await response.text()),
      contentType: response.headers()['content-type'] ?? null,
      durationMs: Date.now() - responseStartedAt,
      ok: response.ok(),
      status: response.status(),
      statusText: response.statusText(),
      url: response.url(),
    }
  } catch (followUpError) {
    diagnostics.followUpGet = {
      error: errorSummary(followUpError),
    }
  }

  await testInfo.attach('seeded specification navigation diagnostics', {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

async function gotoSeededSpecification(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  const path = `/sv/specifications/${fixture.specificationId}`
  const startedAt = Date.now()

  try {
    await page.goto(path, {
      timeout: specificationNavigationTimeoutMs,
      waitUntil: 'domcontentloaded',
    })
  } catch (error) {
    await attachSpecificationNavigationDiagnostics(
      page,
      testInfo,
      path,
      startedAt,
      error,
    )
    throw error
  }
}

async function assertForbiddenSpecificationSurface(page: Page): Promise<void> {
  await page.goto(`/sv/specifications/${fixture.specificationId}`)

  await expect(
    page.getByRole('heading', {
      name: 'Du har inte åtkomst till detta kravunderlag',
    }),
  ).toBeVisible()
  await expect(page.getByText(fixture.specificationName)).toBeVisible()
  await expect(page.getByText('Petra specresp')).toBeVisible()
  await expect(page.getByText('petra.specresp@example.test')).toBeVisible()
  await expect(page.getByText('Nytt unikt krav')).toHaveCount(0)
}

async function assertReadOnlyRequirementDetail(page: Page): Promise<void> {
  const requirementsResponse = await page.request.get(
    '/api/requirements?limit=1&locale=sv&statuses=3',
  )
  await expectOk(requirementsResponse, 'published requirement list for UI')
  const requirements =
    (await requirementsResponse.json()) as RequirementListResponse
  const publishedRequirement = requirements.requirements[0]
  expect(publishedRequirement).toBeDefined()

  await page.goto(`/sv/requirements/${publishedRequirement.uniqueId}`)

  await expect(
    page.getByText(
      'Du kan läsa kravet, men du kan inte ändra dess livscykel eller innehåll.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Redigera krav' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { exact: true, name: 'Arkivera' }),
  ).toHaveCount(0)
  await expect(
    page.locator(
      '[data-developer-mode-name="detail action"][data-developer-mode-value="edit"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="archive"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="approve archiving"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="cancel archiving"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="delete draft"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value="restore version"],' +
        '[data-developer-mode-name="detail action"][data-developer-mode-value^="move to "]',
    ),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dela' })).toBeVisible()
}

test.describe('AUTHZ-01/AUTH-10/AUTH-11: forbidden requirement specification surface', () => {
  test.use({
    storageState: ROLE_STORAGE_STATE.noRoles,
    viewport: DESKTOP_VIEWPORT,
  })

  test('AUTHZ-01/AUTH-10/AUTH-11: shows responsible contact without content on desktop', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-01', 'AUTH-10', 'AUTH-11')

    await page.goto('/sv/specifications')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kravunderlag' }),
    ).toBeVisible()
    await expect(page.getByText(fixture.specificationName)).toHaveCount(0)

    await assertForbiddenSpecificationSurface(page)
  })

  test('AUTHZ-01/AUTH-10/AUTH-11: shows published requirement detail as read-only without lifecycle controls', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-01', 'AUTH-10', 'AUTH-11')

    await assertReadOnlyRequirementDetail(page)
  })

  test('AUTHZ-01/AUTH-08/AUTH-10/AUTH-11: denies Admin Center to users without global roles', async ({
    page,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-01', 'AUTH-08', 'AUTH-10', 'AUTH-11')

    await page.goto('/sv/admin?tab=actionAuditLog')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Du saknar behörighet till Administrationscenter',
      }),
    ).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
  })
})
