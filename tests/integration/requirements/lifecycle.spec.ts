import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test'
import {
  newRoleContext,
  ROLE_STORAGE_STATE,
  type RoleContext,
} from '../authorization/authorization-test-helpers'

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3

interface RequirementDetail {
  id: number
  isArchived: boolean
  uniqueId: string
  versions: Array<{
    status: number
    versionRequirementPackages?: Array<{
      requirementPackage: {
        id: number
        name: string | null
      }
    }>
    versionNumber: number
  }>
}

interface OkResponse {
  ok(): boolean
  status(): number
  text(): Promise<string>
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function latestVersion(detail: RequirementDetail) {
  const latest = [...detail.versions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  )[0]
  if (!latest) {
    throw new Error(`Requirement ${detail.uniqueId} has no versions.`)
  }

  return latest
}

function findVersion(detail: RequirementDetail, versionNumber: number) {
  const version = detail.versions.find(
    candidate => candidate.versionNumber === versionNumber,
  )
  if (!version) {
    throw new Error(
      `Requirement ${detail.uniqueId} has no version ${versionNumber}.`,
    )
  }

  return version
}

function requirementPackageNames(
  detail: RequirementDetail,
  versionNumber: number,
) {
  return (
    findVersion(detail, versionNumber).versionRequirementPackages?.map(
      versionRequirementPackage =>
        versionRequirementPackage.requirementPackage.name,
    ) ?? []
  )
}

async function expectOk(response: OkResponse, context: string) {
  if (response.ok()) return

  throw new Error(
    `${context} failed with ${response.status()} ${await response.text()}`,
  )
}

async function getOkWithRetry(
  context: string,
  request: () => Promise<OkResponse>,
): Promise<OkResponse> {
  let lastFailure = 'unknown failure'

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request()
      if (response.ok()) return response

      lastFailure = `${response.status()} ${await response.text()}`
      if (response.status() < 500 || attempt === 3) {
        throw new Error(`${context} failed with ${lastFailure}`)
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
      if (attempt === 3) {
        throw new Error(`${context} failed after retries: ${lastFailure}`)
      }
    }

    await delay(750 * (attempt + 1))
  }

  throw new Error(`${context} failed after retries: ${lastFailure}`)
}

async function createDraftRequirement(
  request: APIRequestContext,
  description: string,
): Promise<RequirementDetail> {
  const areasResponse = await getOkWithRetry('GET requirement areas', () =>
    request.get('/api/requirement-areas', { timeout: 30_000 }),
  )
  const areasBody = (await areasResponse.json()) as {
    areas: Array<{ id: number }>
  }
  const area = areasBody.areas[0]
  expect(area).toBeDefined()

  const createResponse = await request.post('/api/requirements', {
    data: {
      areaId: area.id,
      description,
      requiresTesting: false,
    },
    timeout: 30_000,
  })
  await expectOk(createResponse, 'POST requirement')
  const created = (await createResponse.json()) as {
    requirement: { id: number; uniqueId: string }
  }

  return getRequirement(request, created.requirement.uniqueId)
}

async function getRequirement(
  request: APIRequestContext,
  uniqueId: string,
): Promise<RequirementDetail> {
  const response = await getOkWithRetry(`GET requirement ${uniqueId}`, () =>
    request.get(`/api/requirements/${uniqueId}`, { timeout: 30_000 }),
  )
  return (await response.json()) as RequirementDetail
}

async function transitionRequirement(
  request: APIRequestContext,
  uniqueId: string,
  statusId: number,
) {
  let lastFailure = 'unknown failure'

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await request.post(
        `/api/requirement-transitions/${uniqueId}`,
        {
          data: { statusId },
          timeout: 30_000,
        },
      )
      if (response.ok()) return

      lastFailure = `${response.status()} ${await response.text()}`
      const updated = await getRequirement(request, uniqueId).catch(() => null)
      if (updated && latestVersion(updated).status === statusId) return

      if (response.status() < 500 || attempt === 3) {
        throw new Error(
          `POST transition ${uniqueId} to ${statusId} failed with ${lastFailure}`,
        )
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
      const updated = await getRequirement(request, uniqueId).catch(() => null)
      if (updated && latestVersion(updated).status === statusId) return

      if (attempt === 3) {
        throw new Error(
          `POST transition ${uniqueId} to ${statusId} failed after retries: ${lastFailure}`,
        )
      }
    }

    await delay(750 * (attempt + 1))
  }

  throw new Error(
    `POST transition ${uniqueId} to ${statusId} failed after retries: ${lastFailure}`,
  )
}

async function createRequirementInStatus(
  request: APIRequestContext,
  statusId: number,
  description: string,
  reviewerRequest?: APIRequestContext,
): Promise<RequirementDetail> {
  const requirement = await createDraftRequirement(request, description)
  if (statusId >= STATUS_REVIEW) {
    await transitionRequirement(request, requirement.uniqueId, STATUS_REVIEW)
  }
  if (statusId >= STATUS_PUBLISHED) {
    await transitionRequirement(
      reviewerRequest ?? request,
      requirement.uniqueId,
      STATUS_PUBLISHED,
    )
  }

  return getRequirement(request, requirement.uniqueId)
}

async function newRolePage(
  browser: Browser,
  testInfo: TestInfo,
  role: RoleContext,
) {
  const context = await browser.newContext({
    baseURL: String(
      testInfo.project.use.baseURL ??
        process.env.PLAYWRIGHT_BASE_URL ??
        'http://localhost:3000',
    ),
    storageState: ROLE_STORAGE_STATE[role],
    viewport: { height: 720, width: 1280 },
  })
  const page = await context.newPage()

  return { context, page }
}

async function openRequirement(page: Page, uniqueId: string): Promise<Locator> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(
      `/sv/requirements?selected=${encodeURIComponent(uniqueId)}`,
      { timeout: 30_000, waitUntil: 'domcontentloaded' },
    )

    try {
      const rowButton = page.getByRole('button', {
        name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
      })
      await expect(rowButton).toBeVisible({ timeout: 30_000 })

      const detailPaneId = await rowButton.getAttribute('aria-controls')
      if (!detailPaneId) {
        throw new Error(`Requirement row ${uniqueId} has no detail pane target.`)
      }

      const detailPane = page.locator(`#${detailPaneId}`)
      await expect(detailPane).toBeVisible({ timeout: 30_000 })
      return detailPane
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement row ${uniqueId} did not load.`)
}

async function openRequirementStandalone(
  page: Page,
  uniqueId: string,
  versionNumber?: number,
): Promise<Locator> {
  const suffix = versionNumber === undefined ? '' : `/${versionNumber}`

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/sv/requirements/${uniqueId}${suffix}`, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    })

    try {
      const main = page.locator('main')
      await expect(
        main.getByRole('heading', {
          name: new RegExp(escapeRegExp(uniqueId)),
        }),
      ).toBeVisible({ timeout: 30_000 })
      await expect(main.getByText('Kravtext')).toBeVisible({ timeout: 30_000 })
      return main
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement detail ${uniqueId}${suffix} did not load.`)
}

async function assertActiveStepperStep(
  container: Locator,
  expectedText: string,
) {
  const activeStep = container
    .getByRole('group', { name: 'Arbetsflöde för kravversionsstatus' })
    .locator('[aria-current="step"]')

  await expect(activeStep).toContainText(expectedText, { timeout: 30_000 })
}

async function expectLatestStatus(
  request: APIRequestContext,
  uniqueId: string,
  expectedStatus: number,
) {
  await expect
    .poll(
      async () => {
        const updated = await getRequirement(request, uniqueId)
        return latestVersion(updated).status
      },
      { timeout: 60_000 },
    )
    .toBe(expectedStatus)
}

async function confirmDialog(page: Page) {
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Bekräfta' }).click()
  await expect(dialog).toBeHidden()
}

test.describe('Requirement lifecycle manual cases', () => {
  test.setTimeout(180_000)
  test.use({ viewport: { height: 720, width: 1280 } })

  test('LIFE-02: incomplete requirement creation stays client-side invalid', async ({
    page,
  }) => {
    let createRequests = 0
    page.on('request', request => {
      const url = new URL(request.url())
      if (request.method() === 'POST' && url.pathname === '/api/requirements') {
        createRequests += 1
      }
    })

    await page.goto('/sv/requirements/new')
    await expect(page.getByRole('button', { name: 'Spara' })).toBeDisabled()

    await page.locator('#description').fill('Ofullständigt Playwright-krav')
    await page.getByRole('button', { name: 'Spara' }).click()

    await expect(page).toHaveURL(/\/sv\/requirements\/new$/)
    await expect
      .poll(() =>
        page
          .locator('#areaId')
          .evaluate(element => (element as HTMLSelectElement).validity.valid),
      )
      .toBe(false)
    expect(createRequests).toBe(0)
  })

  test('LIFE-03: draft requirement can be sent to review from the UI', async ({
    page,
    request,
  }) => {
    const requirement = await createRequirementInStatus(
      request,
      STATUS_DRAFT,
      'Playwright LIFE-03 draft requirement',
    )
    const detailPane = await openRequirement(page, requirement.uniqueId)

    await detailPane.getByRole('button', { name: 'Granskning ↗' }).click()
    await expectLatestStatus(request, requirement.uniqueId, STATUS_REVIEW)
    await assertActiveStepperStep(detailPane, 'Granskning')
  })

  test('LIFE-04: requirement in review can be returned to draft from the UI', async ({
    browser,
    request,
  }, testInfo) => {
    const requirement = await createRequirementInStatus(
      request,
      STATUS_REVIEW,
      'Playwright LIFE-04 review requirement',
    )
    const reviewer = await newRolePage(browser, testInfo, 'reviewer')

    try {
      const detailPane = await openRequirement(
        reviewer.page,
        requirement.uniqueId,
      )

      await detailPane.getByRole('button', { name: '← Utkast' }).click()
      await confirmDialog(reviewer.page)
      await expectLatestStatus(request, requirement.uniqueId, STATUS_DRAFT)
      await assertActiveStepperStep(detailPane, 'Utkast')
    } finally {
      await reviewer.context.close()
    }
  })

  test('LIFE-05: requirement in review can be published from the UI', async ({
    browser,
    request,
  }, testInfo) => {
    const requirement = await createRequirementInStatus(
      request,
      STATUS_REVIEW,
      'Playwright LIFE-05 review requirement',
    )
    const reviewer = await newRolePage(browser, testInfo, 'reviewer')

    try {
      const detailPane = await openRequirement(
        reviewer.page,
        requirement.uniqueId,
      )

      await detailPane.getByRole('button', { name: 'Publicera ↗' }).click()
      await confirmDialog(reviewer.page)
      await expectLatestStatus(request, requirement.uniqueId, STATUS_PUBLISHED)
      await assertActiveStepperStep(detailPane, 'Publicerad')
    } finally {
      await reviewer.context.close()
    }
  })

  test('LIFE-06: editing a published requirement creates a new draft version', async ({
    page,
    request,
  }, testInfo) => {
    const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
    let requirement: RequirementDetail
    try {
      requirement = await createRequirementInStatus(
        request,
        STATUS_PUBLISHED,
        'Playwright LIFE-06 published requirement',
        reviewerRequest,
      )
    } finally {
      await reviewerRequest.dispose()
    }
    const detailPane = await openRequirementStandalone(page, requirement.uniqueId)

    await detailPane.getByRole('link', { name: 'Redigera' }).click()
    await expect(page).toHaveURL(
      new RegExp(`/sv/requirements/${requirement.uniqueId}/edit$`),
    )
    const descriptionField = page.getByRole('textbox', { name: 'Kravtext *' })
    await expect(descriptionField).toHaveValue(
      'Playwright LIFE-06 published requirement',
    )
    await descriptionField.fill('Playwright LIFE-06 updated draft version')
    await expect(descriptionField).toHaveValue(
      'Playwright LIFE-06 updated draft version',
    )
    const saveButton = page.getByRole('button', { name: 'Spara' })
    await expect(saveButton).toBeEnabled()
    await saveButton.scrollIntoViewIfNeeded()
    const editForm = page.locator('form')
    await expect
      .poll(() =>
        editForm.evaluate(form => (form as HTMLFormElement).checkValidity()),
      )
      .toBe(true)
    await Promise.all([
      page.waitForRequest(
        request => {
          const url = new URL(request.url())
          return (
            request.method() === 'PUT' &&
            url.pathname === `/api/requirements/${requirement.uniqueId}`
          )
        },
        { timeout: 30_000 },
      ),
      editForm.evaluate(form => {
        const htmlForm = form as HTMLFormElement
        const submitter = htmlForm.querySelector('button[type="submit"]')
        htmlForm.dispatchEvent(
          new SubmitEvent('submit', {
            bubbles: true,
            cancelable: true,
            submitter:
              submitter instanceof HTMLElement ? submitter : undefined,
          }),
        )
      }),
    ])
    await expect
      .poll(async () => {
        const updated = await getRequirement(request, requirement.uniqueId)
        return {
          latestStatus: latestVersion(updated).status,
          versionCount: updated.versions.length,
        }
      }, { timeout: 60_000 })
      .toEqual({
        latestStatus: STATUS_DRAFT,
        versionCount: 2,
      })
  })

  test('LIFE-07: restores an archived requirement version through the UI', async ({
    page,
  }) => {
    const restoreRequests: unknown[] = []
    await page.route(
      '**/api/requirements/PWT-LIFE-RESTORE/restore',
      async route => {
        restoreRequests.push(route.request().postDataJSON())
        await route.fulfill({
          contentType: 'application/json',
          json: { ok: true },
        })
      },
    )

    await page.goto('/sv/requirements/PWT-LIFE-RESTORE/1')
    await expect(
      page.getByRole('button', { name: 'Återskapa version' }),
    ).toBeEnabled()

    await page.getByRole('button', { name: 'Återskapa version' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Avbryt' })
      .click()
    expect(restoreRequests).toEqual([])

    await page.getByRole('button', { name: 'Återskapa version' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Bekräfta' })
      .click()

    await expect.poll(() => restoreRequests).toEqual([{ versionNumber: 1 }])
  })

  test('LIFE-12: draft package replacement leaves the published package intact before publication', async ({
    page,
    request,
  }) => {
    const requirement = await getRequirement(request, 'PWT-LIFE-PACKAGE-SWAP')

    const detailPane = await openRequirementStandalone(
      page,
      requirement.uniqueId,
      1,
    )
    await expect(detailPane.getByText('PWT-MANUAL källpaket')).toHaveCount(1, {
      timeout: 30_000,
    })
    await expect(
      detailPane.getByText('PWT-MANUAL ersättningspaket'),
    ).toHaveCount(0)

    expect(requirementPackageNames(requirement, 1)).toEqual([
      'PWT-MANUAL källpaket',
    ])
    expect(requirementPackageNames(requirement, 2)).toEqual([
      'PWT-MANUAL ersättningspaket',
    ])
    expect(latestVersion(requirement).status).toBe(STATUS_DRAFT)
  })

  test('LIFE-13: package membership remains visible for the archived package-history fixture', async ({
    page,
    request,
  }) => {
    const archiveRequests: string[] = []
    await page.route('**/api/requirements/**', async route => {
      if (route.request().method() !== 'DELETE') {
        await route.continue()
        return
      }
      archiveRequests.push(route.request().url())
      await route.fulfill({
        contentType: 'application/json',
        json: { ok: true },
      })
    })
    const requirement = await getRequirement(
      request,
      'PWT-LIFE-PACKAGE-ARCHIVE',
    )

    const detailPane = await openRequirementStandalone(
      page,
      requirement.uniqueId,
    )
    await expect(detailPane.getByText('PWT-MANUAL källpaket')).toHaveCount(1, {
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Arkivera' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Avbryt' })
      .click()
    expect(archiveRequests).toEqual([])

    await page.getByRole('button', { name: 'Arkivera' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Bekräfta' })
      .click()

    expect(requirementPackageNames(requirement, 1)).toEqual([
      'PWT-MANUAL källpaket',
    ])
    expect(latestVersion(requirement).status).toBe(STATUS_PUBLISHED)
    await expect
      .poll(() => archiveRequests)
      .toEqual([
        expect.stringMatching(
          /\/api\/requirements\/(?:920003|PWT-LIFE-PACKAGE-ARCHIVE)$/u,
        ),
      ])
  })
})
