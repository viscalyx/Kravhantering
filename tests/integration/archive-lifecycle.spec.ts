import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'

const STATUS_DRAFT = 1
const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3
const STATUS_ARCHIVED = 4

interface RequirementDetail {
  isArchived: boolean
  versions: RequirementVersion[]
}

interface RequirementVersion {
  archiveInitiatedAt: string | null
  status: number
  versionNumber: number
}

const viewports = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 720, name: 'desktop', width: 1280 },
] as const

const archiveFixtures = {
  approve: {
    desktop: 'PWT0005',
    mobile: 'PWT0006',
  },
  cancel: {
    desktop: 'PWT0007',
    mobile: 'PWT0008',
  },
  dismissInitiation: {
    desktop: 'PWT0009',
    mobile: 'PWT0010',
  },
} as const

async function expectOk(response: APIResponse, context: string) {
  if (response.ok()) return

  throw new Error(
    `${context} failed with ${response.status()} ${await response.text()}`,
  )
}

function latestVersion(detail: RequirementDetail) {
  return [...detail.versions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  )[0]
}

async function getRequirement(
  request: APIRequestContext,
  uniqueId: string,
): Promise<RequirementDetail> {
  const response = await request.get(`/api/requirements/${uniqueId}`)
  await expectOk(response, `GET ${uniqueId}`)
  return (await response.json()) as RequirementDetail
}

async function transitionRequirement(
  request: APIRequestContext,
  uniqueId: string,
  statusId: number,
) {
  await expectOk(
    await request.post(`/api/requirement-transitions/${uniqueId}`, {
      data: { statusId },
    }),
    `Transition ${uniqueId} to ${statusId}`,
  )
}

async function ensurePublishedRequirement(
  request: APIRequestContext,
  uniqueId: string,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const detail = await getRequirement(request, uniqueId)
    const latest = latestVersion(detail)

    if (
      latest?.status === STATUS_PUBLISHED &&
      !latest.archiveInitiatedAt &&
      !detail.isArchived
    ) {
      return
    }

    if (latest?.status === STATUS_REVIEW && latest.archiveInitiatedAt) {
      await transitionRequirement(request, uniqueId, STATUS_PUBLISHED)
      continue
    }

    if (latest?.status === STATUS_ARCHIVED || detail.isArchived) {
      await expectOk(
        await request.post(`/api/requirements/${uniqueId}/restore`, {
          data: { versionNumber: latest.versionNumber },
        }),
        `Restore ${uniqueId}`,
      )
      await transitionRequirement(request, uniqueId, STATUS_REVIEW)
      await transitionRequirement(request, uniqueId, STATUS_PUBLISHED)
      continue
    }

    if (latest?.status === STATUS_DRAFT) {
      await transitionRequirement(request, uniqueId, STATUS_REVIEW)
      await transitionRequirement(request, uniqueId, STATUS_PUBLISHED)
      continue
    }

    if (latest?.status === STATUS_REVIEW) {
      await transitionRequirement(request, uniqueId, STATUS_PUBLISHED)
    }
  }

  throw new Error(`Could not repair ${uniqueId} to Published before test`)
}

async function openRequirement(page: Page, uniqueId: string): Promise<Locator> {
  await page.goto(`/sv/requirements?selected=${encodeURIComponent(uniqueId)}`)

  const row = page.locator(
    `[data-developer-mode-name="table row"][data-developer-mode-value="${uniqueId}"]`,
  )
  await expect(row).toBeVisible()

  const detailPane = page.locator(
    `[data-developer-mode-name="inline detail pane"][data-developer-mode-value="${uniqueId}"]`,
  )
  await expect(detailPane).toBeVisible()

  return detailPane
}

async function selectLatestVersion(
  detailPane: Locator,
  request: APIRequestContext,
  uniqueId: string,
) {
  const detail = await getRequirement(request, uniqueId)
  const latest = latestVersion(detail)

  await detailPane
    .locator(`[data-version-number="${latest.versionNumber}"]`)
    .click()
}

async function assertActiveStepperStep(
  container: Locator,
  expectedText: string,
) {
  const activeStep = container
    .getByRole('group', { name: 'Arbetsflöde för kravstatus' })
    .locator('[aria-current="step"]')

  await expect(activeStep).toContainText(expectedText)
}

async function assertRequirementApiState(
  request: APIRequestContext,
  uniqueId: string,
  expected: {
    archiveInitiated: boolean
    isArchived: boolean
    status: number
  },
) {
  const detail = await getRequirement(request, uniqueId)
  const latest = latestVersion(detail)

  expect(detail.isArchived).toBe(expected.isArchived)
  expect(latest?.status).toBe(expected.status)
  if (expected.archiveInitiated) {
    expect(latest?.archiveInitiatedAt).toBeTruthy()
  } else {
    expect(latest?.archiveInitiatedAt).toBeNull()
  }
}

async function confirmLatestDialog(page: Page) {
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Bekräfta' }).click()
}

async function cancelLatestDialog(page: Page) {
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Avbryt' }).click()
}

for (const viewport of viewports) {
  test.describe(`Archive lifecycle — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { height: viewport.height, width: viewport.width } })

    test('cancels archive initiation without changing Published state', async ({
      page,
      request,
    }) => {
      const uniqueId = archiveFixtures.dismissInitiation[viewport.name]
      let detailPane = page.locator('body')

      await test.step('prepare and open a published requirement', async () => {
        await ensurePublishedRequirement(request, uniqueId)
        detailPane = await openRequirement(page, uniqueId)
        await assertActiveStepperStep(detailPane, 'Publicerad')
      })

      await test.step('cancel the archive initiation dialog', async () => {
        await detailPane
          .getByRole('button', { exact: true, name: 'Arkivera' })
          .click()

        const dialog = page.getByRole('alertdialog')
        await expect(dialog).toContainText(
          'Är du säker på att du vill starta arkiveringsprocessen för detta krav?',
        )
        await cancelLatestDialog(page)

        await assertActiveStepperStep(detailPane, 'Publicerad')
      })

      await test.step('verify the requirement stayed published', async () => {
        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: false,
          isArchived: false,
          status: STATUS_PUBLISHED,
        })
      })
    })

    test('approves archiving after cancelling the approval once', async ({
      page,
      request,
    }) => {
      const uniqueId = archiveFixtures.approve[viewport.name]
      let detailPane = page.locator('body')

      await test.step('prepare and initiate archiving', async () => {
        await ensurePublishedRequirement(request, uniqueId)
        detailPane = await openRequirement(page, uniqueId)

        await detailPane
          .getByRole('button', { exact: true, name: 'Arkivera' })
          .click()
        await confirmLatestDialog(page)
        await selectLatestVersion(detailPane, request, uniqueId)

        await assertActiveStepperStep(detailPane, 'Arkiveringsgranskning')
      })

      await test.step('cancel the first approval confirmation', async () => {
        await detailPane
          .getByRole('button', { name: 'Godkänn arkivering' })
          .click()

        const dialog = page.getByRole('alertdialog')
        await expect(dialog).toContainText(
          'Är du säker på att du vill arkivera detta krav?',
        )
        await cancelLatestDialog(page)

        await assertActiveStepperStep(detailPane, 'Arkiveringsgranskning')
        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: true,
          isArchived: false,
          status: STATUS_REVIEW,
        })
      })

      await test.step('approve archiving and verify archived state', async () => {
        await detailPane
          .getByRole('button', { name: 'Godkänn arkivering' })
          .click()
        await confirmLatestDialog(page)
        await expect(detailPane).toBeHidden()

        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: false,
          isArchived: true,
          status: STATUS_ARCHIVED,
        })
      })
    })

    test('cancels archiving after cancelling the cancellation once', async ({
      page,
      request,
    }) => {
      const uniqueId = archiveFixtures.cancel[viewport.name]
      let detailPane = page.locator('body')

      await test.step('prepare and initiate archiving', async () => {
        await ensurePublishedRequirement(request, uniqueId)
        detailPane = await openRequirement(page, uniqueId)

        await detailPane
          .getByRole('button', { exact: true, name: 'Arkivera' })
          .click()
        await confirmLatestDialog(page)
        await selectLatestVersion(detailPane, request, uniqueId)

        await assertActiveStepperStep(detailPane, 'Arkiveringsgranskning')
      })

      await test.step('cancel the first cancellation confirmation', async () => {
        await detailPane
          .getByRole('button', { name: 'Avbryt arkivering' })
          .click()

        const dialog = page.getByRole('alertdialog')
        await expect(dialog).toContainText(
          'Är du säker på att du vill avbryta arkiveringen och återgå till Publicerad?',
        )
        await cancelLatestDialog(page)

        await assertActiveStepperStep(detailPane, 'Arkiveringsgranskning')
        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: true,
          isArchived: false,
          status: STATUS_REVIEW,
        })
      })

      await test.step('cancel archiving and verify published state', async () => {
        await detailPane
          .getByRole('button', { name: 'Avbryt arkivering' })
          .click()
        await confirmLatestDialog(page)

        await assertActiveStepperStep(detailPane, 'Publicerad')
        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: false,
          isArchived: false,
          status: STATUS_PUBLISHED,
        })
      })
    })
  })
}
