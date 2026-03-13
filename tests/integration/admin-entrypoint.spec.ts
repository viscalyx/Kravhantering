import { expect, test } from '@playwright/test'

test('header settings link opens the Swedish admin center', async ({
  page,
}) => {
  await page.goto('/sv/kravkatalog')

  await expect(page.getByRole('button', { name: 'Referensdata' })).toHaveCount(
    0,
  )

  const settingsLink = page.getByRole('link', { name: 'Inställningar' })
  await expect(settingsLink).toBeVisible()
  await expect(settingsLink).toHaveAttribute('href', '/sv/admin')

  await settingsLink.click()
  await expect(page).toHaveURL('/sv/admin')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Administrationscenter',
  )
})

for (const locale of ['sv', 'en'] as const) {
  test(`admin page loads for ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/admin`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      locale === 'sv' ? 'Administrationscenter' : 'Admin center',
    )
  })
}
