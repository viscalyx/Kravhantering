import { expect, type Page, test } from '@playwright/test'
import {
  getRequirementRowButton,
  resolveRequirementDetailPane,
} from './requirement-detail-test-helpers'

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

async function openRequirementInlineDetail(page: Page, uniqueId = 'INT0001') {
  await page.goto(`/sv/requirements?selected=${encodeURIComponent(uniqueId)}`, {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  })

  const rowButton = getRequirementRowButton(page, uniqueId)
  await expect(rowButton).toHaveCount(1, { timeout: 30_000 })

  const detailPane = await resolveRequirementDetailPane(
    page,
    rowButton,
    uniqueId,
  )
  await expect(detailPane).toHaveCount(1, { timeout: 30_000 })
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

      test('REQ-05: keeps the floating pill visible during horizontal scroll and still toggles columns', async ({
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

        await trigger.click()
        await scrollContainer.evaluate(node => {
          node.scrollLeft = node.scrollWidth
        })
        await expect(trigger).toBeVisible()

        const beforeScrollTriggerBox = await trigger.boundingBox()
        const scrollBox = await scrollContainer.boundingBox()
        const viewportSize = page.viewportSize()

        expect(beforeScrollTriggerBox).not.toBeNull()
        expect(scrollBox).not.toBeNull()
        expect(viewportSize).not.toBeNull()

        if (beforeScrollTriggerBox && viewportSize) {
          expect(beforeScrollTriggerBox.x).toBeGreaterThanOrEqual(0)
          expect(
            beforeScrollTriggerBox.x + beforeScrollTriggerBox.width,
          ).toBeLessThanOrEqual(viewportSize.width)
        }

        const afterHorizontalScrollTriggerBox = await trigger.boundingBox()
        expect(afterHorizontalScrollTriggerBox).not.toBeNull()
        if (beforeScrollTriggerBox && afterHorizontalScrollTriggerBox) {
          expect(
            Math.abs(
              Math.round(afterHorizontalScrollTriggerBox.x) -
                Math.round(beforeScrollTriggerBox.x),
            ),
          ).toBeLessThanOrEqual(1)
        }

        await expect(
          page.locator('[data-floating-action-rail-placement="inline-top"]'),
        ).toBeVisible()

        await trigger.click()
        await expect(popover).toBeVisible()

        if (!(await versionCheckbox.isChecked())) {
          await versionCheckbox.check()
        }
        await expect(versionCheckbox).toBeChecked()

        await trigger.click()

        const verifiableHeaderLabel = page.locator(
          '[data-requirement-header-label="verifiable"]',
        )
        const versionHeaderLabel = page.locator(
          '[data-requirement-header-label="version"]',
        )

        await expect(verifiableHeaderLabel).toBeVisible()
        await expect(versionHeaderLabel).toBeVisible()

        const verifiableLabelBox = await verifiableHeaderLabel.boundingBox()
        const versionLabelBox = await versionHeaderLabel.boundingBox()

        expect(verifiableLabelBox).not.toBeNull()
        expect(versionLabelBox).not.toBeNull()

        if (verifiableLabelBox && versionLabelBox) {
          const verifiableLabelCenterY =
            verifiableLabelBox.y + verifiableLabelBox.height / 2
          const versionLabelCenterY =
            versionLabelBox.y + versionLabelBox.height / 2

          expect(
            Math.abs(verifiableLabelCenterY - versionLabelCenterY),
          ).toBeLessThanOrEqual(2)
        }

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

      test('REQ-08: keeps the inline command rail and header sticky during vertical scroll', async ({
        page,
      }) => {
        await openRequirementInlineDetail(page)

        const columnsTrigger = page.locator(
          '[data-column-picker-trigger="true"]',
        )
        const requirementPackageFilter = page.locator(
          '[data-requirement-package="1"]',
        )
        const stickyChrome = page.locator('[data-sticky-table-chrome="true"]')
        const headerLabel = page
          .locator('[data-requirement-header-label="uniqueId"]')
          .first()

        await expect(columnsTrigger).toBeVisible()
        await expect(requirementPackageFilter).toBeVisible()
        await requirementPackageFilter.hover()
        await expect(page.getByRole('tooltip')).toContainText(
          'Krav som gäller när systemet används från mobiltelefon eller surfplatta.',
        )
        await expect(headerLabel).toBeVisible()

        const beforeScrollBox = await columnsTrigger.boundingBox()
        expect(beforeScrollBox).not.toBeNull()
        if (!beforeScrollBox) {
          throw new Error(
            'Column picker trigger did not expose a bounding box.',
          )
        }

        await page.mouse.wheel(0, 320)
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBeGreaterThan(200)
        await expect(requirementPackageFilter).toBeVisible()
        await expect(headerLabel).toBeVisible()
        await expect(stickyChrome).toBeVisible()

        const afterScrollBox = await columnsTrigger.boundingBox()
        const stickyChromeBox = await stickyChrome.boundingBox()
        expect(afterScrollBox).not.toBeNull()
        expect(stickyChromeBox).not.toBeNull()
        if (!afterScrollBox) {
          throw new Error(
            'Column picker trigger lost its bounding box after vertical scroll.',
          )
        }
        if (!stickyChromeBox) {
          throw new Error(
            'Sticky table chrome did not expose a bounding box after vertical scroll.',
          )
        }

        expect(Math.round(afterScrollBox.y)).toBeLessThanOrEqual(
          Math.round(beforeScrollBox.y) + 1,
        )
        expect(Math.round(afterScrollBox.y)).toBeGreaterThanOrEqual(0)
        expect(Math.round(stickyChromeBox.y)).toBeGreaterThanOrEqual(0)
        expect(Math.round(stickyChromeBox.y)).toBeLessThanOrEqual(
          Math.round(beforeScrollBox.y) + 1,
        )
      })
    })
  }
})
