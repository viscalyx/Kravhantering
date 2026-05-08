import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'

interface DeviationData {
  decision: number | null
  decisionMotivation: string | null
  id: number
  isReviewRequested: number
  motivation: string
}

const SPECIFICATION_SLUG = 'PLAYWRIGHT-LIFECYCLE-2026'

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

async function expectOk(response: APIResponse) {
  if (response.ok()) return

  throw new Error(
    `Expected API response to be ok, got ${response.status()} ${await response.text()}`,
  )
}

async function listDeviations(
  request: APIRequestContext,
  itemRef: string,
): Promise<DeviationData[]> {
  const response = await request.get(
    `/api/specification-item-deviations/${encodeURIComponent(itemRef)}`,
  )
  await expectOk(response)
  const body = (await response.json()) as { deviations: DeviationData[] }
  return body.deviations
}

async function closeLatestPendingDeviation(
  request: APIRequestContext,
  itemRef: string,
) {
  const deviations = await listDeviations(request, itemRef)
  const latest = deviations.at(-1)

  if (!latest || latest.decision !== null) return

  if (latest.isReviewRequested !== 1) {
    await expectOk(
      await request.post(`/api/deviations/${latest.id}/request-review`),
    )
  }

  await expectOk(
    await request.post(`/api/deviations/${latest.id}/decision`, {
      data: {
        decidedBy: 'Playwright cleanup',
        decision: 2,
        decisionMotivation: 'Closed before rerunning the Playwright flow.',
      },
    }),
  )
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
    .poll(
      async () => {
        const latest = (await listDeviations(request, itemRef)).at(-1)

        if (!latest) return null

        return {
          decision: latest.decision,
          decisionMotivation: latest.decisionMotivation,
          isReviewRequested: latest.isReviewRequested,
          motivation: latest.motivation,
        }
      },
      { timeout: 15_000 },
    )
    .toMatchObject(expected)
}

async function openSpecificationFixtureRow(page: Page, uniqueId: string) {
  await page.goto(`/sv/specifications/${SPECIFICATION_SLUG}`)

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Playwright lifecycle fixtures',
    }),
  ).toBeVisible()

  const itemsPanel = page.locator(
    '[data-specification-detail-list-panel="items"]',
  )
  const rowButton = itemsPanel.getByRole('button', {
    name: new RegExp(`^${uniqueId}\\b`),
  })

  await rowButton.click()

  const detailPane = page.locator(
    `[data-developer-mode-name="inline detail pane"][data-developer-mode-value="${uniqueId}"]`,
  )
  await expect(detailPane).toBeVisible()
  return detailPane
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

    for (const deviationCase of deviationCases) {
      test(`can ${deviationCase.action} a deviation after review is requested`, async ({
        page,
        request,
      }) => {
        const fixture = deviationCase.fixtures[viewport.name]
        const motivation = `${fixture.uniqueId} ${viewport.name} ${deviationCase.action} deviation`
        const decisionMotivation = `${fixture.uniqueId} ${viewport.name} ${deviationCase.action} decision`
        let detailPane = page.locator('body')

        await test.step('prepare fixture and open the specification item', async () => {
          await closeLatestPendingDeviation(request, fixture.itemRef)
          detailPane = await openSpecificationFixtureRow(page, fixture.uniqueId)
          await expect(
            detailPane.getByRole('button', { name: 'Begär ett avsteg' }),
          ).toBeVisible()
        })

        await test.step('create a draft deviation', async () => {
          await detailPane
            .getByRole('button', { name: 'Begär ett avsteg' })
            .click()

          const dialog = page.getByRole('dialog', { name: 'Begär ett avsteg' })
          await dialog.locator('#deviation-motivation').fill(motivation)
          await dialog.locator('#deviation-createdBy').fill('Playwright Test')
          await dialog
            .getByRole('button', { name: 'Registrera avsteg' })
            .click()

          await expectLatestDeviationState(request, fixture.itemRef, {
            decision: null,
            isReviewRequested: 0,
            motivation,
          })
          detailPane = await openSpecificationFixtureRow(page, fixture.uniqueId)

          await assertActiveStepperStep(detailPane, 'Utkast')
          await expect(detailPane).toContainText(motivation)
        })

        await test.step('request review and cancel the revert confirmation', async () => {
          await detailPane.getByRole('button', { name: /Granskning/ }).click()
          await expectLatestDeviationState(request, fixture.itemRef, {
            decision: null,
            isReviewRequested: 1,
            motivation,
          })
          detailPane = await openSpecificationFixtureRow(page, fixture.uniqueId)
          await assertActiveStepperStep(detailPane, 'Granskning begärd')

          await detailPane.getByRole('button', { name: /Utkast/ }).click()
          const confirmDialog = page.getByRole('alertdialog')
          await expect(confirmDialog).toContainText(
            'Är du säker på att du vill återställa detta avsteg till utkast?',
          )
          await confirmDialog.getByRole('button', { name: 'Avbryt' }).click()

          await assertActiveStepperStep(detailPane, 'Granskning begärd')
          await expect(
            detailPane.getByRole('button', { name: /Beslutad/ }),
          ).toBeVisible()
        })

        await test.step(`record a ${deviationCase.expectedStatus.toLowerCase()} decision`, async () => {
          await detailPane.getByRole('button', { name: /Beslutad/ }).click()

          const decisionDialog = page.getByRole('dialog', {
            name: 'Registrera beslut',
          })
          await decisionDialog.getByLabel(deviationCase.radioLabel).check()
          await decisionDialog
            .locator('#decision-motivation')
            .fill(decisionMotivation)
          await decisionDialog
            .locator('#decision-decidedBy')
            .fill('Playwright Reviewer')
          await decisionDialog
            .getByRole('button', { name: 'Registrera beslut' })
            .click()

          await expectLatestDeviationState(request, fixture.itemRef, {
            decision: deviationCase.decision,
            decisionMotivation,
            isReviewRequested: 1,
            motivation,
          })
          detailPane = await openSpecificationFixtureRow(page, fixture.uniqueId)

          await assertActiveStepperStep(detailPane, 'Beslutad')
          await expect(detailPane).toContainText(deviationCase.expectedStatus)
          await expect(detailPane).toContainText(decisionMotivation)
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
      })
    }
  })
}
