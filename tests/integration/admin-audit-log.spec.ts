import { expect, test } from '@playwright/test'

test('admin can filter action audit events and export CSV', async ({
  page,
}) => {
  await page.goto('/sv/admin/audit-log')

  await expect(page.getByRole('heading', { name: 'Åtgärdslogg' })).toBeVisible()
  await expect(page.getByText('requirement.create')).toBeVisible()

  await page.getByLabel('Åtgärd').fill('requirement.create')
  await page.getByLabel('Klient-IP').fill('203.0.113.10')
  await page.getByRole('button', { name: 'Filtrera' }).click()

  await expect(page).toHaveURL(/action=requirement\.create/)
  await expect(page).toHaveURL(/client_ip=203\.0\.113\.10/)
  await expect(page.getByText('requirement.create')).toBeVisible()

  const exportHref = await page
    .getByRole('link', { name: 'Exportera CSV' })
    .getAttribute('href')
  expect(exportHref).toContain('format=csv')

  const response = await page.request.get(exportHref ?? '')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('text/csv')
  const csv = await response.text()
  expect(csv).toContain('occurredAt;actorKind')
  expect(csv).toContain('requirement.create')
  expect(csv).toContain('203.0.113.10')
})
