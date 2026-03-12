import { expect, test } from '@playwright/test'

const COLUMN_VISIBILITY_STORAGE_KEY = 'kravkatalog.visibleColumns.v1'

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
        await page.goto('/sv/kravkatalog')

        const trigger = page.locator('[data-column-picker-trigger="true"]')
        const scrollContainer = page
          .locator('[data-requirements-scroll-container="true"]')
          .first()

        await expect(trigger).toBeVisible()
        await trigger.click()

        const popover = page.locator('[data-column-picker-popover="true"]')
        const checkboxes = popover.locator('input[type="checkbox"]')
        const typeCategoryCheckbox = checkboxes.nth(5)
        const requiresTestingCheckbox = checkboxes.nth(7)
        const versionCheckbox = checkboxes.nth(8)

        await expect(popover).toBeVisible()

        if (!(await typeCategoryCheckbox.isChecked())) {
          await typeCategoryCheckbox.check()
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
            Math.max(Math.round(scrollBox.x + scrollBox.width + 12), railMargin),
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

        const storedColumns = await page.evaluate(
          storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
          COLUMN_VISIBILITY_STORAGE_KEY,
        )

        expect(storedColumns).toContain('"typeCategory"')
        expect(storedColumns).toContain('"requiresTesting"')
        expect(storedColumns).toContain('"version"')
      })
    })
  }
})
