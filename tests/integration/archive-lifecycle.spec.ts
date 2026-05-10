import { existsSync, readFileSync } from 'node:fs'
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'
import type { DataSource } from 'typeorm'
import { sqlServerEntities } from '../../lib/typeorm/entities'
import {
  createSqlServerDataSource,
  getSqlServerDatabaseUrl,
  type SqlServerRuntimeEnv,
} from '../../lib/typeorm/sqlserver-config'

const STATUS_REVIEW = 2
const STATUS_PUBLISHED = 3
const STATUS_ARCHIVED = 4

interface RequirementDetail {
  id?: number
  isArchived: boolean
  uniqueId?: string
  versions?: RequirementVersion[]
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

let playwrightSqlServerDataSource: Promise<DataSource> | null = null

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function expectOk(response: APIResponse, context: string) {
  if (response.ok()) return

  throw new Error(
    `${context} failed with ${response.status()} ${await response.text()}`,
  )
}

function latestVersion(detail: RequirementDetail): RequirementVersion {
  const latest = [...(detail.versions ?? [])].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  )[0]
  if (!latest) {
    const identifier =
      detail.uniqueId && detail.id != null
        ? `${detail.uniqueId} (${detail.id})`
        : (detail.uniqueId ?? `id ${detail.id ?? 'unknown'}`)
    throw new Error(`RequirementDetail has no versions for ${identifier}`)
  }

  return latest
}

async function getRequirement(
  request: APIRequestContext,
  uniqueId: string,
): Promise<RequirementDetail> {
  const response = await request.get(`/api/requirements/${uniqueId}`)
  await expectOk(response, `GET ${uniqueId}`)
  return (await response.json()) as RequirementDetail
}

async function ensurePublishedRequirement(
  request: APIRequestContext,
  uniqueId: string,
) {
  await resetRequirementToPublished(uniqueId)
  await assertRequirementApiState(request, uniqueId, {
    archiveInitiated: false,
    isArchived: false,
    status: STATUS_PUBLISHED,
  })
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const normalized = line.startsWith('export ')
          ? line.slice('export '.length).trim()
          : line
        const separatorIndex = normalized.indexOf('=')
        if (separatorIndex === -1) return null

        const key = normalized.slice(0, separatorIndex).trim()
        let value = normalized.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }

        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

function getPlaywrightSqlServerEnv(): SqlServerRuntimeEnv {
  return {
    ...readEnvFile('.env.prodlike'),
    ...readEnvFile('.env.sqlserver'),
    ...process.env,
  } as SqlServerRuntimeEnv
}

async function getPlaywrightSqlServerDataSource(): Promise<DataSource> {
  if (playwrightSqlServerDataSource) return playwrightSqlServerDataSource

  const env = getPlaywrightSqlServerEnv()
  const url = getSqlServerDatabaseUrl(env)
  const dataSource = createSqlServerDataSource({
    entities: sqlServerEntities,
    env,
    name: 'archive-lifecycle-fixtures',
    url,
  })

  playwrightSqlServerDataSource = dataSource
    .initialize()
    .then(() => dataSource)
    .catch(error => {
      playwrightSqlServerDataSource = null
      throw error
    })

  return playwrightSqlServerDataSource
}

test.afterAll(async () => {
  if (!playwrightSqlServerDataSource) return

  try {
    const dataSource = await playwrightSqlServerDataSource
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  } finally {
    playwrightSqlServerDataSource = null
  }
})

async function resetRequirementToPublished(uniqueId: string) {
  const db = await getPlaywrightSqlServerDataSource()
  const now = new Date()

  await db.transaction(async manager => {
    const requirementRows = (await manager.query(
      `SELECT TOP (1) id FROM requirements WHERE unique_id = @0`,
      [uniqueId],
    )) as Array<{ id: number }>
    const requirementId = requirementRows[0]?.id
    if (requirementId == null) {
      throw new Error(`Requirement ${uniqueId} not found`)
    }

    const latestRows = (await manager.query(
      `SELECT TOP (1) id
        FROM requirement_versions
        WHERE requirement_id = @0
        ORDER BY version_number DESC`,
      [requirementId],
    )) as Array<{ id: number }>
    const latestVersionId = latestRows[0]?.id
    if (latestVersionId == null) {
      throw new Error(`Requirement ${uniqueId} has no versions`)
    }

    await manager.query(
      `UPDATE requirements SET is_archived = 0 WHERE id = @0`,
      [requirementId],
    )
    await manager.query(
      `UPDATE requirement_versions
        SET requirement_status_id = @3,
            archived_at = COALESCE(archived_at, @1),
            archive_initiated_at = NULL,
            revision_token = NEWID()
        WHERE requirement_id = @0 AND id <> @2`,
      [requirementId, now, latestVersionId, STATUS_ARCHIVED],
    )
    await manager.query(
      `UPDATE requirement_versions
        SET requirement_status_id = @2,
            published_at = COALESCE(published_at, @1),
            archived_at = NULL,
            archive_initiated_at = NULL,
            revision_token = NEWID()
        WHERE id = @0`,
      [latestVersionId, now, STATUS_PUBLISHED],
    )
  })
}

async function openRequirement(page: Page, uniqueId: string): Promise<Locator> {
  await page.goto(`/sv/requirements?selected=${encodeURIComponent(uniqueId)}`)

  const rowButton = page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
  })
  await expect(rowButton).toBeVisible()

  const detailPaneId = await rowButton.getAttribute('aria-controls')
  if (!detailPaneId) {
    throw new Error(
      `Requirement row ${uniqueId} does not control a detail pane`,
    )
  }

  const detailPane = page.locator(`#${detailPaneId}`)
  await expect(detailPane).toBeVisible()

  return detailPane
}

async function selectLatestVersion(
  detailPane: Locator,
  request: APIRequestContext,
  uniqueId: string,
  expectedStatusText?: string,
) {
  const detail = await getRequirement(request, uniqueId)
  const latest = latestVersion(detail)
  const latestVersionPill = detailPane.locator(
    `button[data-version-number="${latest.versionNumber}"]`,
  )

  await expect(latestVersionPill).toBeVisible()
  if (expectedStatusText) {
    await expect(latestVersionPill).toContainText(expectedStatusText)
  }
  await latestVersionPill.click()
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
  await expect
    .poll(async () => {
      const detail = await getRequirement(request, uniqueId)
      const latest = latestVersion(detail)

      return {
        archiveInitiated: Boolean(latest.archiveInitiatedAt),
        isArchived: detail.isArchived,
        status: latest.status,
      }
    })
    .toEqual(expected)
}

async function assertRequirementListStatus(
  page: Page,
  uniqueId: string,
  expectedStatusText: string,
) {
  const rowButton = page.getByRole('button', {
    name: new RegExp(`\\b${escapeRegExp(uniqueId)}\\b`),
  })
  const row = rowButton.locator('xpath=ancestor::tr[1]')

  await expect(row).toContainText(expectedStatusText, { timeout: 15_000 })
}

async function confirmLatestDialog(page: Page) {
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Bekräfta' }).click()
  await expect(dialog).toBeHidden()
}

async function cancelLatestDialog(page: Page) {
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Avbryt' }).click()
  await expect(dialog).toBeHidden()
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
        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: true,
          isArchived: false,
          status: STATUS_REVIEW,
        })
        await assertRequirementListStatus(page, uniqueId, 'Granskning')
        await selectLatestVersion(
          detailPane,
          request,
          uniqueId,
          'Arkiveringsgranskning',
        )

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
        await assertRequirementApiState(request, uniqueId, {
          archiveInitiated: true,
          isArchived: false,
          status: STATUS_REVIEW,
        })
        await assertRequirementListStatus(page, uniqueId, 'Granskning')
        await selectLatestVersion(
          detailPane,
          request,
          uniqueId,
          'Arkiveringsgranskning',
        )

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
