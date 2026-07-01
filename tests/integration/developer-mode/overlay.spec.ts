import { expect, type Page, test } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
]

async function gotoRequirementsWhenReady(page: Page) {
  await page.goto('/sv/requirements')
  await expect(
    page.getByRole('button', { name: 'Filtrera efter Krav-ID' }),
  ).toBeVisible({
    timeout: 30_000,
  })
}

async function gotoRequirementInlineDetail(page: Page, requirementId: string) {
  await page.goto(
    `/sv/requirements?selected=${encodeURIComponent(requirementId)}`,
  )
  const rowButton = page.getByRole('button', {
    exact: true,
    name: requirementId,
  })
  await expect(rowButton).toBeVisible({ timeout: 30_000 })

  const expandedDetail = page.locator('[data-expanded-detail-cell]').first()
  await expect(expandedDetail).toBeVisible({ timeout: 30_000 })

  const requirementTextSection = page
    .locator(
      '[data-developer-mode-name="detail section"][data-developer-mode-value="requirement text"]',
    )
    .first()
  await expect(requirementTextSection).toBeVisible({ timeout: 30_000 })

  return { requirementTextSection, rowButton }
}

for (const viewport of viewports) {
  test.describe(`Developer mode overlay — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        globalThis.localStorage.clear()
        globalThis.sessionStorage.clear()
      })
    })

    test('DEVTOOLS-01: shows chip on hover and copies a contextual reference', async ({
      page,
    }) => {
      const { requirementTextSection, rowButton } =
        await gotoRequirementInlineDetail(page, 'INT0001')

      await rowButton.focus()
      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      // Hover over the detail section and verify chip appears.
      await requirementTextSection.hover()
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

    test('DEVTOOLS-02: keeps developer mode active across client navigation into admin', async ({
      page,
    }) => {
      await gotoRequirementsWhenReady(page)
      await page.getByRole('button', { name: 'Filtrera efter Krav-ID' }).focus()
      await page.keyboard.press('Control+Alt+Shift+H')

      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      if (viewport.name === 'mobile') {
        await page.getByRole('button', { name: 'Öppna meny' }).click()
      }

      const settingsLink = page.getByRole('link', { name: 'Inställningar' })
      await expect(settingsLink).toBeVisible()
      await settingsLink.click()
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

    test('DEVTOOLS-03: exposes specification report controls in developer mode', async ({
      page,
    }) => {
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
          '[data-developer-mode-name="report button"][data-developer-mode-value="specification reports"]',
        )
        .first()
      await expect(specificationReportButton).toBeVisible({ timeout: 30_000 })
      await specificationReportButton.scrollIntoViewIfNeeded()

      await specificationReportButton.focus()
      await page.keyboard.press('Control+Alt+Shift+H')
      await expect(page.getByTestId('developer-mode-badge')).toBeVisible()

      await specificationReportButton.hover()
      const chip = page.locator('[data-developer-mode-overlay-chip="true"]')
      await expect(chip).toBeVisible()
      await expect(chip).toContainText('report button: specification reports')
    })

    test('DEVTOOLS-01: keeps sticky table headers referenceable in developer mode', async ({
      page,
    }) => {
      await gotoRequirementInlineDetail(page, 'INT0001')

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
