import { expect, test } from '@playwright/test'

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 375, height: 812 },
})

test('AUTH-01/NAV-01/REQ-01: mobile sign-in, navigation, and requirements-library access', async ({
  page,
}) => {
  await test.step('sign in on mobile', async () => {
    await page.goto('/sv/requirements')
    await page.locator('#username').fill('ada.admin')
    await page.locator('#password').fill('devpass')
    await page.locator('#kc-login').click()
    await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toHaveCount(1)
  })
  await test.step('navigate through the mobile menu', async () => {
    await page.getByRole('button', { name: 'Öppna meny' }).click()
    await page.getByRole('link', { name: 'Kravbibliotek', exact: true }).click()
  })
  await test.step('verify requirements-library access', async () => {
    await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toHaveCount(1)
  })
})
