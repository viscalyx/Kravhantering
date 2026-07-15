import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test'
import { extractText } from 'unpdf'
import { delay, escapeRegExp } from '@/tests/helpers/common'
import { expectApiResponseOk } from '../api-response-assertions'
import { expectApiResponseOkWithRetry } from '../api-retry-helpers'
import {
  newRoleContext,
  ROLE_STORAGE_STATE,
  type RoleContext,
  referenceManualCases,
} from '../authorization/authorization-test-helpers'
import { resolveIntegrationBaseUrl } from '../base-url'

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3
const STATUS_ARCHIVED = 4

interface RequirementDetail {
  area: {
    id: number
  } | null
  id: number
  isArchived: boolean
  uniqueId: string
  versions: Array<{
    archiveInitiatedAt?: string | null
    description: string
    id: number
    revisionToken: string
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

async function createDraftRequirement(
  request: APIRequestContext,
  description: string,
): Promise<RequirementDetail> {
  const areasResponse = await expectApiResponseOkWithRetry(
    'GET requirement areas',
    () => request.get('/api/requirement-areas', { timeout: 30_000 }),
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
      verifiable: false,
    },
    timeout: 30_000,
  })
  await expectApiResponseOk(createResponse, 'POST requirement')
  const created = (await createResponse.json()) as {
    requirement: { id: number; uniqueId: string }
  }

  return getRequirement(request, created.requirement.uniqueId)
}

async function getRequirement(
  request: APIRequestContext,
  uniqueId: string,
): Promise<RequirementDetail> {
  const response = await expectApiResponseOkWithRetry(
    `GET requirement ${uniqueId}`,
    () => request.get(`/api/requirements/${uniqueId}`, { timeout: 30_000 }),
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
    let response: Awaited<ReturnType<APIRequestContext['post']>>
    try {
      response = await request.post(
        `/api/requirement-transitions/${uniqueId}`,
        {
          data: { statusId },
          timeout: 30_000,
        },
      )
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
      const updated = await getRequirement(request, uniqueId).catch(() => null)
      if (updated && latestVersion(updated).status === statusId) return

      if (attempt === 3) {
        throw new Error(
          `POST transition ${uniqueId} to ${statusId} failed after retries: ${lastFailure}`,
        )
      }
      await delay(750 * (attempt + 1))
      continue
    }

    if (response.ok()) return

    lastFailure = `${response.status()} ${await response.text()}`
    const updated = await getRequirement(request, uniqueId).catch(() => null)
    if (updated && latestVersion(updated).status === statusId) return

    if (response.status() < 500) {
      throw new Error(
        `POST transition ${uniqueId} to ${statusId} failed with ${lastFailure}`,
      )
    }
    if (attempt === 3) {
      throw new Error(
        `POST transition ${uniqueId} to ${statusId} failed after retries: ${lastFailure}`,
      )
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
    baseURL: resolveIntegrationBaseUrl(testInfo),
    storageState: ROLE_STORAGE_STATE[role],
    viewport: { height: 720, width: 1280 },
  })
  const page = await context.newPage()

  return { context, page }
}

async function openRequirement(
  page: Page,
  uniqueId: string,
  locale: 'en' | 'sv' = 'sv',
): Promise<Locator> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(
      `/${locale}/requirements?selected=${encodeURIComponent(uniqueId)}`,
      { timeout: 30_000, waitUntil: 'domcontentloaded' },
    )

    try {
      const rowButton = page.getByRole('button', {
        name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
      })
      await expect(rowButton).toBeVisible({ timeout: 30_000 })

      const detailPaneId = await rowButton.getAttribute('aria-controls')
      if (!detailPaneId) {
        throw new Error(
          `Requirement row ${uniqueId} has no detail pane target.`,
        )
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

async function verifyPdfDownload(
  page: Page,
  action: Locator,
  expectedPath: string,
  expectedText: string[],
  unexpectedText: string[] = [],
) {
  const [response, download] = await Promise.all([
    page.waitForResponse(candidate => {
      const url = new URL(candidate.url())
      return (
        candidate.request().method() === 'GET' && url.pathname === expectedPath
      )
    }),
    page.waitForEvent('download'),
    action.click(),
  ])

  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(download.suggestedFilename()).toMatch(/\.pdf$/u)

  const pdfStream = await download.createReadStream()
  if (!pdfStream) {
    throw new Error(`PDF download for ${expectedPath} exposed no stream.`)
  }

  const chunks: Buffer[] = []
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const pdfBuffer = Buffer.concat(chunks)
  expect(pdfBuffer.subarray(0, 4).toString('utf8')).toBe('%PDF')

  const { text: pdfText } = await extractText(Uint8Array.from(pdfBuffer), {
    mergePages: true,
  })
  for (const text of expectedText) {
    expect(pdfText).toContain(text)
  }
  for (const text of unexpectedText) {
    expect(pdfText).not.toContain(text)
  }
}

async function openRequirementStandalone(
  page: Page,
  uniqueId: string,
  versionNumber?: number,
  locale: 'en' | 'sv' = 'sv',
): Promise<Locator> {
  const suffix = versionNumber === undefined ? '' : `/${versionNumber}`

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/requirements/${uniqueId}${suffix}`, {
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
      await expect(main).toContainText(
        locale === 'sv' ? 'Kravtext' : 'Requirement text',
        { timeout: 30_000 },
      )
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

  test('LIFE-04/AUTHZ-09: requirement in review can be returned to draft from the UI by a Reviewer', async ({
    browser,
    request,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-09')
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

  test('LIFE-05/AUTHZ-09: requirement in review can be published from the UI by a Reviewer', async ({
    browser,
    request,
  }, testInfo) => {
    referenceManualCases(testInfo, 'AUTHZ-09')
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
    const updatedDescription = 'Playwright LIFE-06 updated draft version'
    const requirement =
      await test.step('prepare a published requirement', async () => {
        const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
        try {
          return await createRequirementInStatus(
            request,
            STATUS_PUBLISHED,
            'Playwright LIFE-06 published requirement',
            reviewerRequest,
          )
        } finally {
          await reviewerRequest.dispose()
        }
      })

    await test.step('open the edit form and update the requirement text', async () => {
      const detailPane = await openRequirementStandalone(
        page,
        requirement.uniqueId,
      )

      await detailPane.getByRole('link', { name: 'Redigera' }).click()
      await expect(page).toHaveURL(
        new RegExp(`/sv/requirements/${requirement.uniqueId}/edit$`),
      )
      const descriptionField = page.getByRole('textbox', {
        name: 'Kravtext *',
      })
      await expect(descriptionField).toHaveValue(
        'Playwright LIFE-06 published requirement',
      )
      await descriptionField.fill(updatedDescription)
      await expect(descriptionField).toHaveValue(updatedDescription)
    })

    await test.step('save through the enabled form button', async () => {
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
        page.waitForRequest(request => {
          const url = new URL(request.url())
          return (
            request.method() === 'PUT' &&
            url.pathname === `/api/requirements/${requirement.uniqueId}`
          )
        }),
        saveButton.click(),
      ])
    })

    await test.step('verify a new draft version was created', async () => {
      await expect
        .poll(async () => {
          const updated = await getRequirement(request, requirement.uniqueId)
          const latest = latestVersion(updated)
          return {
            latestDescription: latest.description,
            latestStatus: latest.status,
            versionCount: updated.versions.length,
          }
        })
        .toEqual({
          latestDescription: updatedDescription,
          latestStatus: STATUS_DRAFT,
          versionCount: 2,
        })
    })
  })

  test('LIFE-11: authorized report menu matches requirement status', async ({
    page,
    request,
  }, testInfo) => {
    const reviewerRequest = await newRoleContext(testInfo, 'reviewer')

    async function expectReportMenu(
      uniqueId: string,
      expected: { reviewReportVisible: boolean },
    ) {
      const detailPane = await openRequirement(page, uniqueId)
      await detailPane.getByRole('button', { name: 'Rapporter' }).click()
      await expect(
        page.getByRole('menuitem', { name: 'Historikrapport' }),
      ).toBeVisible()
      await expect(
        page.getByRole('menuitem', {
          name: 'Förbättringsförslagshistorik',
        }),
      ).toBeVisible()
      await expect(
        page.getByRole('menuitem', { name: 'Granskningsrapport' }),
      ).toHaveCount(expected.reviewReportVisible ? 1 : 0)
      await page.keyboard.press('Escape')
    }

    try {
      const draft = await createRequirementInStatus(
        request,
        STATUS_DRAFT,
        'Playwright LIFE-11 draft report matrix',
      )
      const review = await createRequirementInStatus(
        request,
        STATUS_REVIEW,
        'Playwright LIFE-11 review report matrix',
      )
      const published = await createRequirementInStatus(
        request,
        STATUS_PUBLISHED,
        'Playwright LIFE-11 published report matrix',
        reviewerRequest,
      )

      await expectReportMenu(draft.uniqueId, { reviewReportVisible: false })
      await expectReportMenu(review.uniqueId, { reviewReportVisible: true })
      await expectReportMenu(published.uniqueId, { reviewReportVisible: false })
    } finally {
      await reviewerRequest.dispose()
    }
  })

  test('LIFE-14/LIFE-15: report PDFs support Swedish and English locales', async ({
    page,
    request,
  }, testInfo) => {
    const reviewerRequest = await newRoleContext(testInfo, 'reviewer')

    try {
      const requirement = await createRequirementInStatus(
        request,
        STATUS_PUBLISHED,
        'Playwright LIFE-14/LIFE-15 localized report structure',
        reviewerRequest,
      )

      const reviewVersionNumber =
        await test.step('edit the published requirement through the Swedish UI', async () => {
          const detail = await openRequirementStandalone(
            page,
            requirement.uniqueId,
          )
          await detail.getByRole('link', { name: 'Redigera' }).click()
          await page
            .getByRole('textbox', { name: 'Kravtext *' })
            .fill('Localized report metadata change')
          await page
            .getByRole('combobox', { name: 'Kategori' })
            .selectOption({ label: 'IT-krav' })

          const saveButton = page.getByRole('button', { name: 'Spara' })
          await expect(saveButton).toBeEnabled()
          await saveButton.scrollIntoViewIfNeeded()
          const editForm = page.locator('form')
          await expect
            .poll(() =>
              editForm.evaluate(form =>
                (form as HTMLFormElement).checkValidity(),
              ),
            )
            .toBe(true)
          await Promise.all([
            page.waitForRequest(candidate => {
              const url = new URL(candidate.url())
              return (
                candidate.method() === 'PUT' &&
                url.pathname === `/api/requirements/${requirement.uniqueId}`
              )
            }),
            saveButton.click(),
          ])

          await expect
            .poll(async () => {
              const updated = await getRequirement(
                request,
                requirement.uniqueId,
              )
              return {
                description: latestVersion(updated).description,
                status: latestVersion(updated).status,
              }
            })
            .toEqual({
              description: 'Localized report metadata change',
              status: STATUS_DRAFT,
            })

          const updated = await getRequirement(request, requirement.uniqueId)
          return latestVersion(updated).versionNumber
        })

      await test.step('send the edited requirement to review through the UI', async () => {
        const detailPane = await openRequirementStandalone(
          page,
          requirement.uniqueId,
          reviewVersionNumber,
        )
        await detailPane.getByRole('button', { name: 'Granskning ↗' }).click()
        await expectLatestStatus(request, requirement.uniqueId, STATUS_REVIEW)
        await assertActiveStepperStep(detailPane, 'Granskning')
      })

      async function verifyLocalizedReports(
        locale: 'en' | 'sv',
        labels: {
          combined: string
          history: string
          reports: string
          review: string
          select: string
        },
        pdfText: {
          combined: string[]
          history: string[]
          review: string[]
          unexpected: string[]
        },
      ) {
        const detailPane = await openRequirementStandalone(
          page,
          requirement.uniqueId,
          reviewVersionNumber,
          locale,
        )
        await expect(page).toHaveURL(
          new RegExp(
            `/${locale}/requirements/${requirement.uniqueId}/${reviewVersionNumber}$`,
          ),
        )

        for (const report of [
          {
            label: labels.review,
            path: `/${locale}/requirements/reports/pdf/review/${requirement.uniqueId}`,
          },
          {
            label: labels.history,
            path: `/${locale}/requirements/reports/pdf/history/${requirement.uniqueId}`,
          },
        ]) {
          await detailPane.getByRole('button', { name: labels.reports }).click()
          await verifyPdfDownload(
            page,
            page.getByRole('menuitem', { name: report.label }),
            report.path,
            pdfText[report.label === labels.review ? 'review' : 'history'],
            pdfText.unexpected,
          )
        }

        await openRequirement(page, requirement.uniqueId, locale)
        await page
          .getByRole('checkbox', {
            name: `${labels.select} ${requirement.uniqueId}`,
          })
          .check()
        await page.locator('[data-floating-action-id="reports"]').click()
        await verifyPdfDownload(
          page,
          page.getByRole('menuitem', { name: labels.combined }),
          `/${locale}/requirements/reports/pdf/review-combined`,
          pdfText.combined,
          pdfText.unexpected,
        )
      }

      await test.step('select English and download each report through the browser', async () => {
        await page.getByRole('button', { name: 'Byt språk' }).click()
        await expect(page).toHaveURL(/\/en\/requirements/)
        await verifyLocalizedReports(
          'en',
          {
            combined: 'Combined Review Report',
            history: 'History Report',
            reports: 'Reports',
            review: 'Review Report',
            select: 'Select',
          },
          {
            combined: [
              'Combined Review Report',
              'Contents',
              'REVIEW REPORTS',
              'Review Report',
              requirement.uniqueId,
              'Metadata Changes',
              'Category',
              'Review',
            ],
            history: [
              'History Report',
              requirement.uniqueId,
              'Current Published Version',
              `Unpublished Version (v${reviewVersionNumber})`,
              'Category',
              'IT requirement',
              'Published',
              'Review',
            ],
            review: [
              'Review Report',
              requirement.uniqueId,
              'Metadata Changes',
              'Category',
              'IT requirement',
              'Review',
            ],
            unexpected: [],
          },
        )
      })

      await test.step('select Swedish and download each report through the browser', async () => {
        await page.getByRole('button', { name: 'Switch language' }).click()
        await expect(page).toHaveURL(/\/sv\/requirements/)
        await verifyLocalizedReports(
          'sv',
          {
            combined: 'Kombinerad granskningsrapport',
            history: 'Historikrapport',
            reports: 'Rapporter',
            review: 'Granskningsrapport',
            select: 'Markera',
          },
          {
            combined: [
              'Kombinerad granskningsrapport',
              'Innehållsförteckning',
              'GRANSKNINGSRAPPORTER',
              'Granskningsrapport',
              requirement.uniqueId,
              'Metadataändringar',
              'Kategori',
              'Granskning',
            ],
            history: [
              'Historikrapport',
              requirement.uniqueId,
              'Nuvarande publicerad version',
              `Opublicerad version (v${reviewVersionNumber})`,
              'Kategori',
              'IT-krav',
              'Publicerad',
              'Granskning',
            ],
            review: [
              'Granskningsrapport',
              requirement.uniqueId,
              'Metadataändringar',
              'Kategori',
              'IT-krav',
              'Granskning',
            ],
            unexpected: [
              'Combined Review Report',
              'History Report',
              'Review Report',
              'Metadata Changes',
              'Category',
              'Published',
              'Review',
            ],
          },
        )
      })
    } finally {
      await reviewerRequest.dispose()
    }
  })

  test('LIFE-07: restores an archived requirement version through the UI', async ({
    page,
    request,
  }, testInfo) => {
    const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
    try {
      const requirement = await createRequirementInStatus(
        request,
        STATUS_PUBLISHED,
        'Playwright LIFE-07 archived predecessor',
        reviewerRequest,
      )
      const firstPublishedVersion = latestVersion(requirement)
      const editResponse = await request.put(
        `/api/requirements/${requirement.uniqueId}`,
        {
          data: {
            areaId: requirement.area?.id,
            baseRevisionToken: firstPublishedVersion.revisionToken,
            baseVersionId: firstPublishedVersion.id,
            description: 'Playwright LIFE-07 published successor',
            verifiable: false,
          },
          timeout: 30_000,
        },
      )
      await expectApiResponseOk(editResponse, 'PUT LIFE-07 successor draft')
      await transitionRequirement(request, requirement.uniqueId, STATUS_REVIEW)
      await transitionRequirement(
        reviewerRequest,
        requirement.uniqueId,
        STATUS_PUBLISHED,
      )
      const beforeRestore = await getRequirement(request, requirement.uniqueId)
      expect(findVersion(beforeRestore, 1).status).toBe(STATUS_ARCHIVED)

      await page.goto(`/sv/requirements/${requirement.uniqueId}/1`)
      await expect(
        page.getByRole('button', { name: 'Återskapa version' }),
      ).toBeEnabled()

      await page.getByRole('button', { name: 'Återskapa version' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Avbryt' })
        .click()
      expect(
        latestVersion(await getRequirement(request, requirement.uniqueId)),
      ).toMatchObject({
        description: 'Playwright LIFE-07 published successor',
        status: STATUS_PUBLISHED,
      })

      await page.getByRole('button', { name: 'Återskapa version' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Bekräfta' })
        .click()

      await expect
        .poll(async () => {
          const restored = await getRequirement(request, requirement.uniqueId)
          const latest = latestVersion(restored)
          return {
            description: latest.description,
            status: latest.status,
            versionCount: restored.versions.length,
          }
        })
        .toEqual({
          description: 'Playwright LIFE-07 archived predecessor',
          status: STATUS_DRAFT,
          versionCount: beforeRestore.versions.length + 1,
        })
    } finally {
      await reviewerRequest.dispose()
    }
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
  }, testInfo) => {
    const reviewerRequest = await newRoleContext(testInfo, 'reviewer')

    try {
      await transitionRequirement(
        reviewerRequest,
        'PWT-LIFE-PACKAGE-ARCHIVE',
        STATUS_PUBLISHED,
      ).catch(() => undefined)
      const requirement = await getRequirement(
        request,
        'PWT-LIFE-PACKAGE-ARCHIVE',
      )
      const detailPane = await openRequirementStandalone(
        page,
        requirement.uniqueId,
      )
      await expect(detailPane.getByText('PWT-MANUAL källpaket')).toHaveCount(
        1,
        {
          timeout: 30_000,
        },
      )
      await page.getByRole('button', { name: 'Arkivera' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Avbryt' })
        .click()
      expect(
        latestVersion(await getRequirement(request, requirement.uniqueId)),
      ).toMatchObject({
        archiveInitiatedAt: null,
        status: STATUS_PUBLISHED,
      })

      await page.getByRole('button', { name: 'Arkivera' }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Bekräfta' })
        .click()

      expect(requirementPackageNames(requirement, 1)).toEqual([
        'PWT-MANUAL källpaket',
      ])
      await expect
        .poll(async () => {
          const archived = await getRequirement(request, requirement.uniqueId)
          const latest = latestVersion(archived)
          return {
            archiveInitiated: latest.archiveInitiatedAt != null,
            packageNames: requirementPackageNames(archived, 1),
            status: latest.status,
          }
        })
        .toEqual({
          archiveInitiated: true,
          packageNames: ['PWT-MANUAL källpaket'],
          status: STATUS_REVIEW,
        })
    } finally {
      await transitionRequirement(
        reviewerRequest,
        'PWT-LIFE-PACKAGE-ARCHIVE',
        STATUS_PUBLISHED,
      ).catch(() => undefined)
      await reviewerRequest.dispose()
    }
  })
})
