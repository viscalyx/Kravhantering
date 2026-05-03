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
      await page.goto('/sv/requirements')

      await page.getByLabel('Filtrera efter Krav-ID').click()
      const searchInput = page.getByRole('textbox', { name: 'Krav-ID' })
      await searchInput.fill('INT0001')
      await searchInput.press('Enter')

      // The sticky table header overlaps this button, so Playwright's
      // actionability check would fail. We bypass it via evaluate() to
      // expand the row before enabling developer mode.
      await page
        .getByRole('button', { exact: true, name: 'INT0001' })
        .evaluate(el => (el as HTMLElement).click())
      await expect(
        page.locator('[data-expanded-detail-cell]').first(),
      ).toBeVisible()
      await page.getByRole('button', { exact: true, name: 'INT0001' }).focus()
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
      await page.goto('/sv/requirements')
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

    test('exposes specification report controls in developer mode', async ({
      page,
      request,
    }) => {
      const response = await request.post(
        '/api/specifications/ETJANST-UPP-2026/items',
        {
          data: { requirementIds: [39] },
        },
      )
      expect(response.ok()).toBe(true)

      await page.goto('/sv/specifications/ETJANST-UPP-2026')

      const itemPanel = page.locator(
        '[data-specification-detail-list-panel="items"]',
      )
      await expect(itemPanel).toBeVisible()
      await itemPanel.locator('tbody tr', { hasText: 'BEH0002' }).click()

      const expandedDetail = itemPanel
        .locator('[data-expanded-detail-cell="true"]')
        .first()
      await expect(expandedDetail).toBeVisible()

      const specificationReportButton = expandedDetail
        .locator(
          '[data-developer-mode-name="report print button"][data-developer-mode-value="specification reports"]',
        )
        .first()
      await specificationReportButton.scrollIntoViewIfNeeded()
      await expect(specificationReportButton).toBeVisible()

      await specificationReportButton.focus()
      await page.keyboard.press('Control+Alt+Shift+H')
      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      await specificationReportButton.hover()
      const chip = page.locator('[data-developer-mode-overlay-chip="true"]')
      await expect(chip).toBeVisible()
      await expect(chip).toContainText(
        'report print button: specification reports',
      )
    })

    test('keeps sticky table headers referenceable in developer mode', async ({
      page,
    }) => {
      await page.goto('/sv/requirements')
      await page.locator('tbody > tr').first().waitFor()
      // force: true because the sticky header overlaps the row button at
      // the top of the list before any scrolling has occurred.
      await page
        .getByRole('button', { exact: true, name: 'INT0001' })
        .click({ force: true })

      await page.mouse.wheel(0, 320)
      const stickyHeader = page.locator(
        'thead th[data-developer-mode-name="column header"][data-developer-mode-value="requirement id"]',
      )
      await expect(stickyHeader).toBeVisible()
      await expect
        .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
        .toBeGreaterThan(200)

      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()
      await stickyHeader.hover()
      const chip = page.locator('[data-developer-mode-overlay-chip="true"]')
      await expect(chip).toBeVisible()

      await chip.click()

      await expect(
        page.locator('[data-developer-mode-toast="true"]'),
      ).toContainText('requirements table > column header: requirement id')
    })
  })
}
