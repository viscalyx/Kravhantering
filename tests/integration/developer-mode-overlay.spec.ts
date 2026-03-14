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

    test('labels key requirements catalog surfaces and copies a contextual reference', async ({
      page,
    }) => {
      await page.goto('/sv/kravkatalog')

      await page.getByLabel('Filtrera efter Krav-ID').click()
      const searchInput = page.getByRole('textbox', { name: 'Krav-ID' })
      await searchInput.fill('INT0001')
      await searchInput.press('Enter')

      await page.getByRole('button', { exact: true, name: 'INT0001' }).click()
      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(
        page.locator('[data-developer-mode-overlay-label="floating pill: columns"]'),
      ).toBeVisible()
      await expect(
        page.locator(
          '[data-developer-mode-overlay-label="column header: requirement id"]',
        ),
      ).toBeVisible()
      await expect(
        page.locator('[data-developer-mode-overlay-label="header chip: INT0001"]'),
      ).toBeVisible()

      const detailChip = page.locator(
        '[data-developer-mode-overlay-label="inline detail pane: INT0001"]',
      )
      await expect(detailChip).toBeVisible()

      const detailSectionChip = page.locator(
        '[data-developer-mode-overlay-label="detail section: requirement text"]',
      )
      await expect(detailSectionChip).toBeVisible()
      await detailSectionChip.click()

      await expect(page.locator('[data-developer-mode-toast="true"]')).toContainText(
        'requirements table > inline detail pane: INT0001 > detail section: requirement text',
      )
    })

    test('keeps developer mode active across client navigation into admin', async ({
      page,
    }) => {
      await page.goto('/sv/kravkatalog')
      await page.getByRole('link', { name: 'Inställningar' }).focus()
      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      await page.getByRole('link', { name: 'Inställningar' }).click()
      await expect(page).toHaveURL('/sv/admin')

      await expect(
        page.locator('[data-developer-mode-overlay-label="edge tab: terminology"]'),
      ).toBeVisible()
      await expect(
        page.locator('[data-developer-mode-overlay-label="edge tab: columns"]'),
      ).toBeVisible()
      await expect(
        page.locator('[data-developer-mode-overlay-label="tab panel: terminology"]'),
      ).toBeVisible()
    })
  })
}
