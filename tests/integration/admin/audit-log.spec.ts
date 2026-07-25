import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { deferRoute } from '../deferred-route'

function requirementCreateAuditRows(page: Page) {
  return page.getByRole('row').filter({
    has: page.getByRole('cell', {
      exact: true,
      name: 'requirement.create',
    }),
  })
}

function requirementCreateAuditRowsFromClientIp(page: Page, clientIp: string) {
  return requirementCreateAuditRows(page).filter({
    has: page.getByRole('cell', { exact: true, name: clientIp }),
  })
}

test('ADMIN-07: admin can filter action-log events and export CSV', async ({
  page,
}) => {
  await page.goto('/sv/admin/audit-log')

  await expect(page.getByRole('heading', { name: 'Åtgärdslogg' })).toBeVisible()

  await page.getByLabel('Åtgärd', { exact: true }).fill('requirement.create')
  await page.getByLabel('Klient-IP', { exact: true }).fill('203.0.113.10')
  await page.getByRole('button', { name: 'Filtrera' }).click()

  await expect(page).toHaveURL(/action=requirement\.create/)
  await expect(page).toHaveURL(/client_ip=203\.0\.113\.10/)
  await expect(
    requirementCreateAuditRowsFromClientIp(page, '203.0.113.10').first(),
  ).toBeVisible()

  const exportButton = page.getByRole('button', { name: 'Exportera CSV' })
  let exportRequestCount = 0
  let downloadCount = 0
  page.on('request', request => {
    const url = new URL(request.url())
    if (
      url.pathname === '/api/admin/audit-events' &&
      url.searchParams.get('format') === 'csv'
    ) {
      exportRequestCount += 1
    }
  })
  page.on('download', () => {
    downloadCount += 1
  })
  const csvRoute = await deferRoute(
    page,
    '**/api/admin/audit-events?*format=csv',
    async route => {
      await route.continue()
    },
  )

  try {
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    await csvRoute.requestStarted

    const progressDialog = page.getByRole('dialog', {
      name: 'Förbereder CSV-export …',
    })
    await expect(progressDialog).toHaveCount(1)
    await expect(
      progressDialog.getByRole('button', { name: 'Avbryt' }),
    ).toBeFocused()
    await expect(exportButton).toBeDisabled()
    expect(exportRequestCount).toBe(1)

    csvRoute.fulfill()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('atgardslogg.csv')
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    const csv = await readFile(downloadPath ?? '', 'utf8')
    expect(csv).toContain('Tidpunkt;Aktörstyp')
    expect(csv).toContain('Tillåten')
    expect(csv).toContain('requirement.create')
    expect(csv).toContain('203.0.113.10')
    await expect(progressDialog).toHaveCount(0)
    await expect(exportButton).toBeFocused()
    await expect(
      page.getByRole('status').filter({ hasText: 'Filen är klar' }),
    ).toHaveCount(1)
    expect(downloadCount).toBe(1)
  } finally {
    await csvRoute.cleanup()
  }

  await page.route('**/api/admin/audit-events?**', async route => {
    if (new URL(route.request().url()).searchParams.get('format') !== 'csv') {
      await route.continue()
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        code: 'output_limit_exceeded',
        details: { limit: 1, limitKind: 'items', output: 'csv' },
        error: 'Output exceeds its configured limit.',
      }),
      contentType: 'application/json',
      status: 422,
    })
  })
  await page.getByRole('button', { name: 'Exportera CSV' }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Nedladdningen misslyckades' }),
  ).toContainText('1 CSV-rader')
  expect(downloadCount).toBe(1)
  await page.getByRole('button', { name: 'Stäng' }).click()
  await expect(exportButton).toBeFocused()
})

test('ADMIN-07: admin can use the action log inline from admin center', async ({
  page,
}) => {
  await page.goto('/sv/admin?tab=actionAuditLog')

  await expect(page.getByRole('heading', { name: 'Åtgärdslogg' })).toBeVisible()

  await expect(async () => {
    await page.getByLabel('Åtgärd', { exact: true }).fill('requirement.create')
    await page.getByLabel('Klient-IP', { exact: true }).fill('203.0.113.10')
    await page.getByRole('button', { name: 'Filtrera' }).click()
    await expect(page).toHaveURL(/action=requirement\.create/, {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })

  await expect(page).toHaveURL(/\/sv\/admin\?/)
  await expect(page).toHaveURL(/tab=actionAuditLog/)
  await expect(page).toHaveURL(/client_ip=203\.0\.113\.10/)
  await expect(
    requirementCreateAuditRowsFromClientIp(page, '203.0.113.10').first(),
  ).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportera CSV' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const csv = await readFile(downloadPath ?? '', 'utf8')
  expect(csv).toContain('Tidpunkt;Aktörstyp')
  expect(csv).toContain('Tillåten')
  expect(csv).toContain('requirement.create')
  expect(csv).toContain('203.0.113.10')
})
