import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

for (const viewport of viewports) {
  test.describe(`Requirement package detail edit action — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('opens the package edit view from the title action', async ({
      page,
    }) => {
      await page.goto('/sv/kravpaket/BEHORIGHET-IAM')

      await expect(
        page.getByRole('heading', { level: 1, name: 'Behörighet och IAM' }),
      ).toBeVisible()

      await page.getByRole('button', { name: 'Redigera kravpaket' }).click()

      await expect(
        page.getByRole('heading', { level: 2, name: 'Redigera kravpaket' }),
      ).toBeVisible()
      await expect(page.getByRole('textbox', { name: /^Namn/ })).toHaveValue(
        'Behörighet och IAM',
      )
    })
  })
}
