import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

for (const viewport of viewports) {
  test.describe(`Developer mode overlay — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        globalThis.localStorage.clear()
      })
    })

    test('shows chip on hover and copies a contextual reference', async ({
      page,
    }) => {
      await page.goto('/sv/kravkatalog')

      await page.getByLabel('Filtrera efter Krav-ID').click()
      const searchInput = page.getByRole('textbox', { name: 'Krav-ID' })
      await searchInput.fill('INT0001')
      await searchInput.press('Enter')

      await page.getByRole('button', { exact: true, name: 'INT0001' }).click()
      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      // Hover over the detail section and verify chip appears.
      const detailSection = page.locator(
        '[data-developer-mode-name="detail section"][data-developer-mode-value="requirement text"]',
      )
      await detailSection.hover()
      const chip = page.locator('[data-developer-mode-overlay-chip="true"]')
      await expect(chip).toBeVisible()
      await expect(chip).toContainText('detail section: requirement text')

      await chip.click()

      await expect(
        page.locator('[data-developer-mode-toast="true"]'),
      ).toContainText(
        'requirements table > inline detail pane: INT0001 > detail section: requirement text',
      )
    })

    test('keeps developer mode active across client navigation into admin', async ({
      page,
    }) => {
      await page.goto('/sv/kravkatalog')
      await page.locator('tbody > tr').first().waitFor()
      await page.getByRole('link', { name: 'Inställningar' }).focus()
      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      await page
        .getByRole('link', { name: 'Inställningar' })
        .evaluate(el => (el as HTMLElement).click())
      await expect(page).toHaveURL('/sv/admin')

      // Badge survives navigation.
      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      // Hover over an admin tab to verify chip appears on the new page.
      const tab = page.locator('[data-developer-mode-name="edge tab"]').first()
      await tab.hover()
      await expect(
        page.locator('[data-developer-mode-overlay-chip="true"]'),
      ).toBeVisible()
    })
  })
}
