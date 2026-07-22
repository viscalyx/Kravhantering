import { expect, type Page, test } from '@playwright/test'

const COLUMN_VISIBILITY_STORAGE_KEY = 'requirements.visibleColumns.v5'

const viewportVariants = [
  {
    name: 'mobile',
    viewport: { height: 667, width: 375 },
  },
  {
    name: 'desktop',
    viewport: { height: 720, width: 1280 },
  },
] as const

async function expectStoredVersionColumn(page: Page, visible: boolean) {
  await expect
    .poll(() =>
      page.evaluate(
        storageKey =>
          (globalThis.localStorage.getItem(storageKey) ?? '').includes(
            '"version"',
          ),
        COLUMN_VISIBILITY_STORAGE_KEY,
      ),
    )
    .toBe(visible)
}

test.describe('Requirements table column picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const clearMarker = '__playwright_requirements_columns_cleared__'
      if (globalThis.sessionStorage.getItem(clearMarker) === '1') return
      globalThis.localStorage.clear()
      globalThis.sessionStorage.setItem(clearMarker, '1')
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('REQ-05: toggles columns and persists the selection', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')

        const trigger = page.locator('[data-column-picker-trigger="true"]')
        await expect(trigger).toBeVisible()
        await trigger.click()

        const popover = page.locator('[data-column-picker-popover="true"]')
        const qualityCharacteristicCheckbox = popover.locator(
          '[data-column-picker-option="qualityCharacteristic"] input[type="checkbox"]',
        )
        const verifiableCheckbox = popover.locator(
          '[data-column-picker-option="verifiable"] input[type="checkbox"]',
        )
        const versionCheckbox = popover.locator(
          '[data-column-picker-option="version"] input[type="checkbox"]',
        )

        await expect(popover).toBeVisible()

        if (!(await qualityCharacteristicCheckbox.isChecked())) {
          await qualityCharacteristicCheckbox.check()
        }
        if (!(await verifiableCheckbox.isChecked())) {
          await verifiableCheckbox.check()
        }

        await expect(popover).toBeVisible()

        if (!(await versionCheckbox.isChecked())) {
          await versionCheckbox.check()
        }
        await expect(versionCheckbox).toBeChecked()

        await trigger.click()

        const versionHeaderLabel = page.locator(
          '[data-requirement-header-label="version"]',
        )

        await expect(versionHeaderLabel).toBeVisible()
        await expect(
          page.getByRole('img', { exact: true, name: 'Verifierbar' }).first(),
        ).toBeVisible()
        await expect(
          page
            .getByRole('img', { exact: true, name: 'Inte verifierbar' })
            .first(),
        ).toBeVisible()

        await trigger.click()
        await expect(popover).toBeVisible()
        await versionCheckbox.uncheck()
        await expect(versionCheckbox).not.toBeChecked()
        await expectStoredVersionColumn(page, false)
        await trigger.click()

        await page.reload()
        await expect(
          page.locator('[data-requirement-header-label="version"]'),
        ).toHaveCount(0)

        await expect(trigger).toBeVisible()
        await trigger.click()
        await expect(popover).toBeVisible()
        await versionCheckbox.check()
        await expect(versionCheckbox).toBeChecked()
        await expectStoredVersionColumn(page, true)
        await trigger.click()

        await page.reload()
        await expect(
          page.locator('[data-requirement-header-label="version"]'),
        ).toBeVisible()

        const storedColumns = await page.evaluate(
          storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
          COLUMN_VISIBILITY_STORAGE_KEY,
        )

        expect(storedColumns).toContain('"qualityCharacteristic"')
        expect(storedColumns).toContain('"verifiable"')
        expect(storedColumns).toContain('"version"')
      })
    })
  }
})
