import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test'
import { delay, escapeRegExp } from '@/tests/helpers/common'
import { expectApiResponseOkWithRetry } from '../api-retry-helpers'
import {
  newRoleContext,
  ROLE_STORAGE_STATE,
  type RoleContext,
} from '../authorization/authorization-test-helpers'

interface DeviationData {
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  motivation: string
}

const SPECIFICATION_SLUG = 'PLAYWRIGHT-LIFECYCLE-2026'
const SPECIFICATION_HEADING = 'Playwright lifecycle fixtures'
const MANUAL_SPECIFICATION_SLUG = 'PWT-SPEC-EDIT-2026'
const MANUAL_SPECIFICATION_HEADING = 'PWT-MANUAL redigerbart kravunderlag'

const viewports = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 720, name: 'desktop', width: 1280 },
] as const

const deviationCases = [
  {
    action: 'approve',
    decision: 1 as const,
    expectedStatus: 'Godkänd',
    fixtures: {
      desktop: { itemRef: 'lib:39', uniqueId: 'PWT0001' },
      mobile: { itemRef: 'lib:40', uniqueId: 'PWT0002' },
    },
    radioLabel: 'Godkänn',
  },
  {
    action: 'reject',
    decision: 2 as const,
    expectedStatus: 'Avslagen',
    fixtures: {
      desktop: { itemRef: 'lib:41', uniqueId: 'PWT0003' },
      mobile: { itemRef: 'lib:42', uniqueId: 'PWT0004' },
    },
    radioLabel: 'Avslå',
  },
] as const

async function listDeviations(
  request: APIRequestContext,
  itemRef: string,
): Promise<DeviationData[]> {
  const response = await expectApiResponseOkWithRetry(
    `list deviations for ${itemRef}`,
    () =>
      request.get(
        `/api/specification-item-deviations/${encodeURIComponent(itemRef)}`,
        { maxRetries: 2, timeout: 30_000 },
      ),
  )
  const body = (await response.json()) as { deviations: DeviationData[] }
  return body.deviations
}

async function closeLatestPendingDeviation(
  authorRequest: APIRequestContext,
  reviewerRequest: APIRequestContext,
  itemRef: string,
) {
  const deviations = await listDeviations(authorRequest, itemRef)
  const latest = deviations.at(-1)

  if (!latest || latest.decision !== null) return

  if (latest.isReviewRequested !== 1) {
    await expectApiResponseOkWithRetry(
      `request review for deviation ${latest.id}`,
      () =>
        authorRequest.post(`/api/deviations/${latest.id}/request-review`, {
          timeout: 30_000,
        }),
    )
  }

  await expectApiResponseOkWithRetry(`close deviation ${latest.id}`, () =>
    reviewerRequest.post(`/api/deviations/${latest.id}/decision`, {
      data: {
        decision: 2,
        decisionMotivation: 'Closed before rerunning the Playwright flow.',
      },
      timeout: 30_000,
    }),
  )
}

async function createDeviationInReview(
  authorRequest: APIRequestContext,
  reviewerRequest: APIRequestContext,
  itemRef: string,
  motivation: string,
): Promise<number> {
  await closeLatestPendingDeviation(authorRequest, reviewerRequest, itemRef)

  const createResponse = await expectApiResponseOkWithRetry(
    `create deviation for ${itemRef}`,
    () =>
      authorRequest.post(
        `/api/specification-item-deviations/${encodeURIComponent(itemRef)}`,
        {
          data: { motivation },
          timeout: 30_000,
        },
      ),
  )
  const created = (await createResponse.json()) as { id: number }

  await expectApiResponseOkWithRetry(
    `request review for deviation ${created.id}`,
    () =>
      authorRequest.post(`/api/deviations/${created.id}/request-review`, {
        timeout: 30_000,
      }),
  )

  return created.id
}

async function expectLatestDeviationState(
  request: APIRequestContext,
  itemRef: string,
  expected: Partial<
    Pick<
      DeviationData,
      'decision' | 'decisionMotivation' | 'isReviewRequested' | 'motivation'
    >
  >,
) {
  await expect
    .poll(async () => {
      const latest = (await listDeviations(request, itemRef)).at(-1)

      if (!latest) return null

      return {
        decision: latest.decision,
        decisionMotivation: latest.decisionMotivation,
        isReviewRequested: latest.isReviewRequested,
        motivation: latest.motivation,
      }
    })
    .toMatchObject(expected)
}

async function openSpecificationFixtureRow(
  page: Page,
  uniqueId: string,
  options: {
    heading?: string
    slug?: string
  } = {},
) {
  const slug = options.slug ?? SPECIFICATION_SLUG
  const heading = options.heading ?? SPECIFICATION_HEADING

  const itemsPanel = page.locator(
    '[data-specification-detail-list-panel="items"]',
  )
  const rowButton = itemsPanel.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
  })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`/sv/specifications/${slug}`, {
        waitUntil: 'commit',
      })
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: heading,
        }),
      ).toBeVisible()
      await expect(rowButton).toBeVisible()
      const detailPaneId = await rowButton.getAttribute('aria-controls')
      if (!detailPaneId) {
        throw new Error(
          `Requirement application row ${uniqueId} does not control a detail pane`,
        )
      }

      const detailPane = itemsPanel.locator(`#${detailPaneId}`)
      for (let clickAttempt = 0; clickAttempt < 3; clickAttempt += 1) {
        if ((await rowButton.getAttribute('aria-expanded')) !== 'true') {
          await rowButton.click()
        }

        if (await detailPane.isVisible().catch(() => false)) {
          await expect(
            detailPane.getByRole('heading', { name: 'Kravtext' }),
          ).toBeVisible()
          return detailPane
        }
      }

      throw new Error(`Requirement application row ${uniqueId} did not expand`)
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement application row ${uniqueId} did not load`)
}

async function newRolePage(
  browser: Browser,
  testInfo: TestInfo,
  role: RoleContext,
  viewport: (typeof viewports)[number],
) {
  const context = await browser.newContext({
    baseURL: String(
      testInfo.project.use.baseURL ??
        process.env.PLAYWRIGHT_BASE_URL ??
        'http://localhost:3000',
    ),
    storageState: ROLE_STORAGE_STATE[role],
    viewport: { height: viewport.height, width: viewport.width },
  })
  const page = await context.newPage()

  return { context, page }
}

async function assertActiveStepperStep(
  container: Locator,
  expectedText: string,
) {
  const activeStep = container
    .getByRole('group', { name: 'Steg i avstegsarbetsflödet' })
    .locator('[aria-current="step"]')

  await expect(activeStep).toContainText(expectedText)
}

for (const viewport of viewports) {
  test.describe(`Deviation lifecycle — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { height: viewport.height, width: viewport.width } })

    test('DEV-03: cancels returning a deviation review to draft', async ({
      page,
      request,
    }, testInfo) => {
      const fixture = deviationCases[0].fixtures[viewport.name]
      const motivation = `${fixture.uniqueId} ${viewport.name} cancel revert deviation`
      const reviewerRequest = await newRoleContext(testInfo, 'reviewer')

      try {
        await createDeviationInReview(
          request,
          reviewerRequest,
          fixture.itemRef,
          motivation,
        )

        const detailPane = await openSpecificationFixtureRow(
          page,
          fixture.uniqueId,
        )
        await assertActiveStepperStep(detailPane, 'Granskning begärd')

        await detailPane.getByRole('button', { name: '← Utkast' }).click()
        const confirmDialog = page.getByRole('alertdialog').filter({
          hasText:
            'Är du säker på att du vill återställa detta avsteg till utkast?',
        })
        await expect(confirmDialog).toContainText(
          'Är du säker på att du vill återställa detta avsteg till utkast?',
        )
        await confirmDialog.getByRole('button', { name: 'Avbryt' }).click()

        await assertActiveStepperStep(detailPane, 'Granskning begärd')
      } finally {
        await closeLatestPendingDeviation(
          request,
          reviewerRequest,
          fixture.itemRef,
        )
        await reviewerRequest.dispose()
      }
    })

    for (const deviationCase of deviationCases) {
      const manualCaseIds = [
        'DEV-01',
        'DEV-02',
        deviationCase.action === 'approve' ? 'DEV-04' : 'DEV-05',
        'DEV-06',
      ].join('/')

      test(`${manualCaseIds}: can ${deviationCase.action} a deviation after review is requested`, async ({
        browser,
        page,
        request,
      }, testInfo) => {
        const fixture = deviationCase.fixtures[viewport.name]
        const motivation = `${fixture.uniqueId} ${viewport.name} ${deviationCase.action} deviation`
        const decisionMotivation = `${fixture.uniqueId} ${viewport.name} ${deviationCase.action} decision`
        let detailPane = page.locator('body')
        const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
        const reviewer = await newRolePage(
          browser,
          testInfo,
          'reviewer',
          viewport,
        )

        try {
          await test.step('prepare fixture and open the requirement application', async () => {
            await closeLatestPendingDeviation(
              request,
              reviewerRequest,
              fixture.itemRef,
            )
            detailPane = await openSpecificationFixtureRow(
              page,
              fixture.uniqueId,
            )
            await expect(
              detailPane.getByRole('button', { name: 'Begär ett avsteg' }),
            ).toBeVisible()
          })

          await test.step('create a draft deviation', async () => {
            await detailPane
              .getByRole('button', { name: 'Begär ett avsteg' })
              .click()

            const dialog = page.getByRole('dialog', {
              name: 'Begär ett avsteg',
            })
            await dialog.locator('#deviation-motivation').fill(motivation)
            await dialog
              .getByRole('button', { name: 'Registrera avsteg' })
              .click()
            await expect(dialog).toBeHidden()

            detailPane = await openSpecificationFixtureRow(
              page,
              fixture.uniqueId,
            )
            await assertActiveStepperStep(detailPane, 'Utkast')
            await expect(detailPane).toContainText(motivation)
          })

          await test.step('request review', async () => {
            await detailPane
              .getByRole('button', { name: 'Granskning ↗' })
              .click()
            detailPane = await openSpecificationFixtureRow(
              page,
              fixture.uniqueId,
            )
            await assertActiveStepperStep(detailPane, 'Granskning begärd')
            await expect(
              detailPane.getByRole('button', { name: 'Beslutad ↗' }),
            ).toHaveCount(0)
          })

          await test.step(`record a ${deviationCase.expectedStatus.toLowerCase()} decision as Reviewer`, async () => {
            let reviewerDetailPane = await openSpecificationFixtureRow(
              reviewer.page,
              fixture.uniqueId,
            )
            await assertActiveStepperStep(
              reviewerDetailPane,
              'Granskning begärd',
            )
            await expect(
              reviewerDetailPane.getByRole('button', { name: '← Utkast' }),
            ).toHaveCount(0)
            await reviewerDetailPane
              .getByRole('button', { name: 'Beslutad ↗' })
              .click()

            const decisionDialog = reviewer.page.getByRole('dialog', {
              name: 'Registrera beslut',
            })
            await decisionDialog.getByLabel(deviationCase.radioLabel).check()
            await decisionDialog
              .locator('#decision-motivation')
              .fill(decisionMotivation)
            await decisionDialog
              .getByRole('button', { name: 'Registrera beslut' })
              .click()
            await expect(decisionDialog).toBeHidden()
            reviewerDetailPane = await openSpecificationFixtureRow(
              reviewer.page,
              fixture.uniqueId,
            )

            await assertActiveStepperStep(reviewerDetailPane, 'Beslutad')
            await expect(reviewerDetailPane).toContainText(
              deviationCase.expectedStatus,
            )
            await expect(reviewerDetailPane).toContainText(decisionMotivation)
            await expect(
              reviewerDetailPane.getByRole('button', { name: 'Beslutad ↗' }),
            ).toHaveCount(0)
            await expect(
              reviewerDetailPane.getByRole('button', { name: '← Utkast' }),
            ).toHaveCount(0)
          })

          await test.step('verify persisted API state', async () => {
            const deviations = await listDeviations(request, fixture.itemRef)
            const latest = deviations.at(-1)

            expect(latest).toBeDefined()
            expect(latest?.decision).toBe(deviationCase.decision)
            expect(latest?.decisionMotivation).toBe(decisionMotivation)
            expect(latest?.isReviewRequested).toBe(1)
            expect(latest?.motivation).toBe(motivation)
          })
        } finally {
          await reviewer.context.close()
          await reviewerRequest.dispose()
        }
      })
    }

    test('DEV-07/AUTHZ-09: specification coauthors can request review but only reviewers can decide deviations', async ({
      browser,
    }, testInfo) => {
      const fixture = {
        itemRef: 'lib:920001',
        uniqueId: 'PWT-SPEC-EDIT-SOURCE',
      }
      const motivation = `${fixture.uniqueId} ${viewport.name} authorization boundary`
      const decisionMotivation = `${fixture.uniqueId} ${viewport.name} reviewer decision`
      const coauthorRequest = await newRoleContext(
        testInfo,
        'specificationCoauthor',
      )
      const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
      const noRolesRequest = await newRoleContext(testInfo, 'noRoles')
      const coauthor = await newRolePage(
        browser,
        testInfo,
        'specificationCoauthor',
        viewport,
      )
      let latestDeviationId: number | null = null

      try {
        await test.step('create a deviation and request review as specification coauthor', async () => {
          await closeLatestPendingDeviation(
            coauthorRequest,
            reviewerRequest,
            fixture.itemRef,
          )

          let detailPane = await openSpecificationFixtureRow(
            coauthor.page,
            fixture.uniqueId,
            {
              heading: MANUAL_SPECIFICATION_HEADING,
              slug: MANUAL_SPECIFICATION_SLUG,
            },
          )

          await detailPane
            .getByRole('button', { name: 'Begär ett avsteg' })
            .click()

          const dialog = coauthor.page.getByRole('dialog', {
            name: 'Begär ett avsteg',
          })
          await dialog.locator('#deviation-motivation').fill(motivation)
          await dialog
            .getByRole('button', { name: 'Registrera avsteg' })
            .click()
          await expect(dialog).toBeHidden()

          await expectLatestDeviationState(coauthorRequest, fixture.itemRef, {
            decision: null,
            isReviewRequested: 0,
            motivation,
          })

          detailPane = await openSpecificationFixtureRow(
            coauthor.page,
            fixture.uniqueId,
            {
              heading: MANUAL_SPECIFICATION_HEADING,
              slug: MANUAL_SPECIFICATION_SLUG,
            },
          )
          await detailPane.getByRole('button', { name: 'Granskning ↗' }).click()
          await expectLatestDeviationState(coauthorRequest, fixture.itemRef, {
            decision: null,
            isReviewRequested: 1,
            motivation,
          })
          await assertActiveStepperStep(detailPane, 'Granskning begärd')
          await expect(
            detailPane.getByRole('button', { name: '← Utkast' }),
          ).toHaveCount(1)
          await expect(
            detailPane.getByRole('button', { name: 'Beslutad ↗' }),
          ).toHaveCount(0)

          const latest = (
            await listDeviations(coauthorRequest, fixture.itemRef)
          ).at(-1)
          if (!latest) {
            throw new Error(
              'Expected a latest deviation after requesting review',
            )
          }
          latestDeviationId = latest.id
        })

        await test.step('verify coauthor and no-role users cannot decide', async () => {
          if (latestDeviationId == null) {
            throw new Error('Expected latest deviation id before 403 checks')
          }

          const coauthorDecision = await coauthorRequest.post(
            `/api/deviations/${latestDeviationId}/decision`,
            {
              data: {
                decision: 1,
                decisionMotivation: 'Coauthor must not decide.',
              },
            },
          )
          expect(coauthorDecision.status()).toBe(403)

          const noRolesDecision = await noRolesRequest.post(
            `/api/deviations/${latestDeviationId}/decision`,
            {
              data: {
                decision: 1,
                decisionMotivation: 'No-role user must not decide.',
              },
            },
          )
          expect(noRolesDecision.status()).toBe(403)
        })

        await test.step('record a reviewer decision', async () => {
          if (latestDeviationId == null) {
            throw new Error('Expected latest deviation id before decision')
          }

          await expectApiResponseOkWithRetry(
            `reviewer decision for deviation ${latestDeviationId}`,
            () =>
              reviewerRequest.post(
                `/api/deviations/${latestDeviationId}/decision`,
                {
                  data: {
                    decision: 1,
                    decisionMotivation,
                  },
                  timeout: 30_000,
                },
              ),
          )
          await expectLatestDeviationState(reviewerRequest, fixture.itemRef, {
            decision: 1,
            decisionMotivation,
            isReviewRequested: 1,
            motivation,
          })
        })
      } finally {
        await coauthor.context.close()
        await coauthorRequest.dispose()
        await reviewerRequest.dispose()
        await noRolesRequest.dispose()
      }
    })
  })
}
