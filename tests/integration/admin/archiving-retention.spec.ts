import { expect, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

test.use({ viewport: DESKTOP_VIEWPORT })

const policy = {
  action: 'delete',
  ageDays: 730,
  decisionReference: null,
  id: 5,
  informationSet: 'Kravunderlag utanför förvaltning',
  isEnabled: true,
  lastRunAt: null,
  latestRun: null,
  policyKey: 'obsolete_specifications_delete',
  statusCondition: 'Inte Förvaltning och äldre än två år',
}
const preview = {
  policy,
  cutoff: '2024-01-01T00:00:00.000Z',
  previewToken: 'preview',
  candidates: [
    {
      action: 'delete',
      ageBasis: '2023-01-01T00:00:00.000Z',
      blockedReasonKey: null,
      currentDisplayValue: 'Gammalt kravunderlag',
      fieldKey: 'specificationArchive',
      key: 'requirements_specifications.obsolete:101',
      objectKey: 'specifications',
      reference: 'ARK1 Gammalt kravunderlag',
      requiresExport: true,
      sourceKey: 'requirements_specifications.obsolete',
      subjectId: '101',
      subjectTable: 'requirements_specifications',
    },
  ],
  summary: {
    archiveCount: 1,
    candidateCount: 1,
    deleteCount: 1,
    exceptionCount: 0,
    skippedCount: 0,
  },
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/admin/archiving/policies', route =>
    route.fulfill({ json: { policies: [policy] } }),
  )
  await page.route('**/api/admin/archiving/preview', route =>
    route.fulfill({ json: preview }),
  )
})

test('ADMIN-31: changed archive content requires a new export before disposal', async ({
  page,
}) => {
  let exportCount = 0
  const usedTokens: string[] = []
  await page.route('**/api/admin/archiving/exports', route =>
    route.fulfill({
      json: {
        archive: { schemaVersion: 'archiving-retention-export.v3' },
        exportToken: `export-${++exportCount}`,
      },
    }),
  )
  await page.route('**/api/admin/archiving/runs', route => {
    usedTokens.push(route.request().postDataJSON().exportToken)
    return usedTokens.length === 1
      ? route.fulfill({
          status: 409,
          json: {
            code: 'CONFLICT',
            error:
              'Archive content has changed. Export again before executing retention.',
          },
        })
      : route.fulfill({ status: 201, json: { ...preview, runId: 11 } })
  })
  const panel = page.getByRole('tabpanel', { name: 'Arkivering' })
  await page.goto('/sv/admin?tab=archiving')
  await page.getByRole('button', { name: 'Förhandsgranska gallring' }).click()
  await expect(page.getByText('ARK1 Gammalt kravunderlag')).toHaveCount(1)
  const execute = panel.getByRole('button', {
    name: 'Kör gallring',
    exact: true,
  })
  await expect(execute).toBeDisabled()
  await expect(
    page.getByText(
      'Exportera arkivet före gallring och bevara den hämtade filen. Ändrat innehåll kräver en ny export.',
    ),
  ).toHaveCount(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportera JSON' }).click()
  expect((await download).suggestedFilename()).toMatch(/^arkivexport-.*\.json$/)
  await execute.click()
  await expect(page.getByRole('alertdialog')).toContainText(
    'Bevara den exporterade filen',
  )
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Kör gallring', exact: true })
    .click()
  await expect(panel.getByRole('alert')).toContainText(
    'exportera ett nytt arkiv före gallring',
  )
  await expect(panel.getByRole('alert')).toHaveAttribute(
    'data-developer-mode-name',
    'retention result',
  )
  await expect(execute).toBeDisabled()
  await page.getByRole('button', { name: 'Förhandsgranska gallring' }).click()
  const newDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportera JSON' }).click()
  await newDownload
  await execute.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Kör gallring', exact: true })
    .click()
  await expect(panel.getByRole('status')).toContainText(
    'Gallringskörningen slutfördes.',
  )
  expect(usedTokens).toEqual(['export-1', 'export-2'])
})

test('ADMIN-32: an uncertain retention response directs the officer to saved evidence before retrying', async ({
  page,
}) => {
  let attempts = 0
  await page.route('**/api/admin/archiving/exports', route =>
    route.fulfill({ json: { archive: {}, exportToken: 'export' } }),
  )
  await page.route('**/api/admin/archiving/runs', route => {
    attempts++
    return route.abort('connectionfailed')
  })
  const panel = page.getByRole('tabpanel', { name: 'Arkivering' })
  await page.goto('/sv/admin?tab=archiving')
  await page.getByRole('button', { name: 'Förhandsgranska gallring' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportera JSON' }).click()
  await download
  await panel.getByRole('button', { name: 'Kör gallring', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Kör gallring', exact: true })
    .click()
  await expect(panel.getByRole('alert')).toContainText(
    'Kontrollera den sparade körningen och Åtgärdsloggen innan åtgärden upprepas.',
  )
  await expect(
    panel.getByRole('button', { name: 'Kör gallring', exact: true }),
  ).toBeDisabled()
  expect(attempts).toBe(1)
})
