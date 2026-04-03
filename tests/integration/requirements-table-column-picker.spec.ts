import { expect, test } from '@playwright/test'

const COLUMN_VISIBILITY_STORAGE_KEY = 'requirements.visibleColumns.v3'

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

test.describe('Requirements table column picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.localStorage.clear()
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('keeps the floating pill visible during horizontal scroll and still toggles columns', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')

        const trigger = page.locator('[data-column-picker-trigger="true"]')
        const scrollContainer = page
          .locator('[data-requirements-scroll-container="true"]')
          .first()

        await expect(trigger).toBeVisible()
        await trigger.click()

        const popover = page.locator('[data-column-picker-popover="true"]')
        const qualityCharacteristicCheckbox = popover.locator(
          '[data-column-picker-option="qualityCharacteristic"] input[type="checkbox"]',
        )
        const requiresTestingCheckbox = popover.locator(
          '[data-column-picker-option="requiresTesting"] input[type="checkbox"]',
        )
        const versionCheckbox = popover.locator(
          '[data-column-picker-option="version"] input[type="checkbox"]',
        )

        await expect(popover).toBeVisible()

        if (!(await qualityCharacteristicCheckbox.isChecked())) {
          await qualityCharacteristicCheckbox.check()
        }
        if (!(await requiresTestingCheckbox.isChecked())) {
          await requiresTestingCheckbox.check()
        }

        await trigger.click()
        await scrollContainer.evaluate(node => {
          node.scrollLeft = node.scrollWidth
        })
        await expect(trigger).toBeVisible()

        const triggerBox = await trigger.boundingBox()
        const scrollBox = await scrollContainer.boundingBox()
        const viewportSize = page.viewportSize()

        expect(triggerBox).not.toBeNull()
        expect(scrollBox).not.toBeNull()
        expect(viewportSize).not.toBeNull()

        if (triggerBox && scrollBox && viewportSize) {
          const railMargin = 8
          const expectedLeft = Math.min(
            Math.max(
              Math.round(scrollBox.x + scrollBox.width + 12),
              railMargin,
            ),
            viewportSize.width - Math.round(triggerBox.width) - railMargin,
          )
          expect(
            Math.abs(Math.round(triggerBox.x) - expectedLeft),
          ).toBeLessThanOrEqual(1)
        }

        await trigger.click()
        await expect(popover).toBeVisible()

        if (!(await versionCheckbox.isChecked())) {
          await versionCheckbox.check()
        }
        await expect(versionCheckbox).toBeChecked()

        await trigger.click()

        const requiresTestingHeaderLabel = page.locator(
          '[data-requirement-header-label="requiresTesting"]',
        )
        const versionHeaderLabel = page.locator(
          '[data-requirement-header-label="version"]',
        )

        await expect(requiresTestingHeaderLabel).toBeVisible()
        await expect(versionHeaderLabel).toBeVisible()

        const requiresTestingLabelBox =
          await requiresTestingHeaderLabel.boundingBox()
        const versionLabelBox = await versionHeaderLabel.boundingBox()

        expect(requiresTestingLabelBox).not.toBeNull()
        expect(versionLabelBox).not.toBeNull()

        if (requiresTestingLabelBox && versionLabelBox) {
          const requiresTestingLabelCenterY =
            requiresTestingLabelBox.y + requiresTestingLabelBox.height / 2
          const versionLabelCenterY =
            versionLabelBox.y + versionLabelBox.height / 2

          expect(
            Math.abs(requiresTestingLabelCenterY - versionLabelCenterY),
          ).toBeLessThanOrEqual(2)
        }

        const storedColumns = await page.evaluate(
          storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
          COLUMN_VISIBILITY_STORAGE_KEY,
        )

        expect(storedColumns).toContain('"qualityCharacteristic"')
        expect(storedColumns).toContain('"requiresTesting"')
        expect(storedColumns).toContain('"version"')
      })
    })
  }
})
