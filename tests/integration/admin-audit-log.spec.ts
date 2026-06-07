import { expect, type Page, test } from '@playwright/test'

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

test('admin can filter action-log events and export CSV', async ({ page }) => {
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

  const exportHref = await page
    .getByRole('link', { name: 'Exportera CSV' })
    .getAttribute('href')
  expect(exportHref).toContain('format=csv')
  expect(exportHref).toContain('locale=sv')

  const response = await page.request.get(exportHref ?? '')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('text/csv')
  const csv = await response.text()
  expect(csv).toContain('Tidpunkt;Aktörstyp')
  expect(csv).toContain('Tillåten')
  expect(csv).toContain('requirement.create')
  expect(csv).toContain('203.0.113.10')
})

test('admin can use the action log inline from admin center', async ({
  page,
}) => {
  await page.goto('/sv/admin?tab=actionAuditLog')

  await expect(page.getByRole('heading', { name: 'Åtgärdslogg' })).toBeVisible()

  await page.getByLabel('Åtgärd', { exact: true }).fill('requirement.create')
  await page.getByLabel('Klient-IP', { exact: true }).fill('203.0.113.10')
  await page.getByRole('button', { name: 'Filtrera' }).click()

  await expect(page).toHaveURL(/\/sv\/admin\?/)
  await expect(page).toHaveURL(/tab=actionAuditLog/)
  await expect(page).toHaveURL(/action=requirement\.create/)
  await expect(page).toHaveURL(/client_ip=203\.0\.113\.10/)
  await expect(
    requirementCreateAuditRowsFromClientIp(page, '203.0.113.10').first(),
  ).toBeVisible()

  const exportHref = await page
    .getByRole('link', { name: 'Exportera CSV' })
    .getAttribute('href')
  expect(exportHref).toContain('format=csv')
  expect(exportHref).toContain('locale=sv')
  expect(exportHref).not.toContain('tab=actionAuditLog')

  const response = await page.request.get(exportHref ?? '')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('text/csv')
  const csv = await response.text()
  expect(csv).toContain('Tidpunkt;Aktörstyp')
  expect(csv).toContain('Tillåten')
  expect(csv).toContain('requirement.create')
  expect(csv).toContain('203.0.113.10')
})
