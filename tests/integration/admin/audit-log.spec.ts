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

  await page
    .getByLabel('Aktörens HSA-id', { exact: true })
    .fill('SE5560000001-linneab')
  await page.getByLabel('Åtgärd', { exact: true }).fill('requirement.create')
  await page.getByLabel('Måltyp', { exact: true }).fill('Requirement')
  await page.getByLabel('Mål-ID', { exact: true }).fill('1')
  await page.getByLabel('Klient-IP', { exact: true }).fill('203.0.113.10')
  await page.getByLabel('Från', { exact: true }).fill('2026-04-23T09:00')
  await page.getByLabel('Till', { exact: true }).fill('2026-04-23T10:00')
  await page.getByRole('button', { name: 'Filtrera' }).click()

  await expect(page).toHaveURL(/actor_hsa_id=SE5560000001-linneab/)
  await expect(page).toHaveURL(/action=requirement\.create/)
  await expect(page).toHaveURL(/target_kind=Requirement/)
  await expect(page).toHaveURL(/target_id=1/)
  await expect(page).toHaveURL(/client_ip=203\.0\.113\.10/)
  await expect
    .poll(() => new URL(page.url()).searchParams.get('from'))
    .toBe('2026-04-23T09:00')
  await expect
    .poll(() => new URL(page.url()).searchParams.get('to'))
    .toBe('2026-04-23T10:00')
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
  let exportUrl: URL | undefined
  const csvBody = [
    '\uFEFFTidpunkt;Aktörstyp;Aktörens HSA-id;Aktörsnamn;Aktörens klient-ID;Åtgärd;Måltyp;Mål-ID;Målets unika ID;Beslut;Orsak;Request-ID;Korrelations-ID;Klient-IP;Detaljer JSON',
    '2026-04-23T09:10:00.000Z;user;SE5560000001-linneab;Linnéa Bergström;;requirement.create;Requirement;1;INT-1;Tillåten;;seed-audit-request-1;seed-audit-correlation-1;203.0.113.10;',
  ].join('\r\n')
  const csvRoute = await deferRoute(
    page,
    '**/api/admin/audit-events?*format=csv',
    async route => {
      exportUrl = new URL(route.request().url())
      await route.fulfill({
        body: csvBody,
        headers: {
          'Content-Disposition': 'attachment; filename="atgardslogg.csv"',
          'Content-Type': 'text/csv; charset=utf-8',
        },
        status: 200,
      })
    },
  )

  try {
    const progressDialog = page.getByRole('dialog', {
      name: 'Förbereder CSV-export …',
    })

    await test.step('starts CSV export and reports progress', async () => {
      await exportButton.click()
      await expect(exportButton).toBeDisabled()
      await csvRoute.requestStarted

      await expect(progressDialog).toHaveCount(1)
      await expect(
        progressDialog.getByRole('button', { name: 'Avbryt' }),
      ).toBeFocused()
      expect(exportRequestCount).toBe(1)
    })

    await test.step('completes the download and reports the CSV result', async () => {
      const downloadPromise = page.waitForEvent('download')
      csvRoute.fulfill()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toBe('atgardslogg.csv')
      const downloadPath = await download.path()
      expect(downloadPath).not.toBeNull()
      const csv = await readFile(downloadPath ?? '', 'utf8')
      expect(csv).toContain('Tidpunkt;Aktörstyp')
      expect(csv).toContain('Tillåten')
      expect(csv).toContain('SE5560000001-linneab')
      expect(csv).toContain('requirement.create')
      expect(csv).toContain('Requirement')
      expect(csv).toContain('INT-1')
      expect(csv).toContain('203.0.113.10')
      expect(exportUrl?.searchParams.get('actor_hsa_id')).toBe(
        'SE5560000001-linneab',
      )
      expect(exportUrl?.searchParams.get('action')).toBe('requirement.create')
      expect(exportUrl?.searchParams.get('target_kind')).toBe('Requirement')
      expect(exportUrl?.searchParams.get('target_id')).toBe('1')
      expect(exportUrl?.searchParams.get('client_ip')).toBe('203.0.113.10')
      expect(exportUrl?.searchParams.get('from')).toBe('2026-04-23T09:00')
      expect(exportUrl?.searchParams.get('to')).toBe('2026-04-23T10:00')
      await expect(progressDialog).toHaveCount(0)
      await expect(exportButton).toBeFocused()
      await expect(
        page.getByRole('status').filter({ hasText: 'Filen är klar' }),
      ).toHaveCount(1)
      expect(downloadCount).toBe(1)
    })
  } finally {
    await csvRoute.cleanup()
  }

  await test.step('reports the output limit without downloading', async () => {
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
