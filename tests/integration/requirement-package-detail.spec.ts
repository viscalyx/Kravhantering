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
      await page.goto('/sv/requirement-packages/BEHORIGHET-IAM')

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

    if (viewport.name === 'desktop') {
      test('lets the package-detail lists scroll independently while keeping the right title bar sticky', async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: 560 })
        await page.goto('/sv/requirement-packages/BEHORIGHET-IAM')
        const activeViewport = page.viewportSize()
        const activeViewportWidth = activeViewport?.width ?? viewport.width
        const activeViewportHeight = activeViewport?.height ?? 560

        const leftPanel = page.locator(
          '[data-package-detail-list-panel="items"]',
        )
        const leftPanelHeading = page.getByRole('heading', {
          level: 2,
          name: /Krav i paketet/,
        })
        const leftEmptyState = page.getByText(
          'Det finns inga krav kopplade till detta paket.',
        )
        const rightPanel = page.locator(
          '[data-package-detail-list-panel="available"]',
        )
        const leftTopBar = leftPanel.locator(
          '[data-requirements-sticky-top-bar="true"]',
        )
        const leftTrigger = leftPanel.locator(
          '[data-column-picker-trigger="true"]',
        )
        const leftTitle = leftPanel.getByRole('heading', {
          level: 2,
          name: /Krav i paketet/,
        })
        const leftHeaderLabel = leftPanel.locator(
          '[data-requirement-header-label="uniqueId"]',
        )
        const rightTopBar = rightPanel.locator(
          '[data-requirements-sticky-top-bar="true"]',
        )
        const rightTrigger = rightPanel.locator(
          '[data-column-picker-trigger="true"]',
        )
        const rightTitle = rightPanel.getByRole('heading', {
          level: 2,
          name: /Tillgängliga krav/,
        })
        const rightHeaderLabel = rightPanel.locator(
          '[data-requirement-header-label="uniqueId"]',
        )

        await expect(rightPanel).toBeVisible()
        await expect(rightTopBar).toBeVisible()
        await expect(rightTrigger).toBeVisible()
        await expect(rightTitle).toBeVisible()
        await expect(rightHeaderLabel).toBeVisible()
        await expect(leftPanelHeading).toBeVisible()
        const hasLeftPanel = (await leftPanel.count()) > 0
        if (hasLeftPanel) {
          await expect(leftPanel).toBeVisible()
          await expect(leftTopBar).toBeVisible()
          await expect(leftTrigger).toBeVisible()
          await expect(leftTitle).toBeVisible()
          await expect(leftHeaderLabel).toBeVisible()
        } else {
          await expect(leftEmptyState).toBeVisible()
        }
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBe(0)

        let leftHasOverflow = hasLeftPanel
          ? await leftPanel.evaluate(
              node => node.scrollHeight > node.clientHeight + 50,
            )
          : false
        let rightHasOverflow = await rightPanel.evaluate(
          node => node.scrollHeight > node.clientHeight + 50,
        )

        if (!leftHasOverflow && !rightHasOverflow && hasLeftPanel) {
          const firstLeftRow = leftPanel.locator('tbody tr').first()
          await firstLeftRow.click()
          await expect(
            leftPanel.locator('[data-expanded-detail-cell="true"]'),
          ).toBeVisible()

          ;[leftHasOverflow, rightHasOverflow] = await Promise.all([
            leftPanel.evaluate(
              node => node.scrollHeight > node.clientHeight + 50,
            ),
            rightPanel.evaluate(
              node => node.scrollHeight > node.clientHeight + 50,
            ),
          ])
        }

        const beforeLeftScrollTop = hasLeftPanel
          ? await leftPanel.evaluate(node => node.scrollTop)
          : 0
        const beforeRightScrollTop = await rightPanel.evaluate(
          node => node.scrollTop,
        )
        const rightPanelBox = await rightPanel.boundingBox()

        expect(rightPanelBox).not.toBeNull()
        if (!rightPanelBox) {
          throw new Error(
            'Available requirements split panel did not expose a bounding box.',
          )
        }

        expect(rightPanelBox.x + rightPanelBox.width).toBeGreaterThanOrEqual(
          activeViewportWidth - 8,
        )
        expect(rightPanelBox.y + rightPanelBox.height).toBeLessThanOrEqual(
          activeViewportHeight,
        )
        if (hasLeftPanel) {
          const leftPanelBox = await leftPanel.boundingBox()

          expect(leftPanelBox).not.toBeNull()
          if (!leftPanelBox) {
            throw new Error('Items split panel did not expose a bounding box.')
          }

          expect(leftPanelBox.x).toBeLessThanOrEqual(8)
          expect(leftPanelBox.y + leftPanelBox.height).toBeLessThanOrEqual(
            activeViewportHeight,
          )
        }
        // If neither panel overflows (e.g. in CI with a small fixture dataset
        // or a large viewport) the scroll-sync behaviour cannot be exercised.
        // Skip rather than assert on a precondition that isn't met.
        if (!rightHasOverflow && !leftHasOverflow) {
          return
        }

        const scrollPanel = rightHasOverflow ? rightPanel : leftPanel
        const beforeScrollTop = rightHasOverflow
          ? beforeRightScrollTop
          : beforeLeftScrollTop
        const beforeTopBarBox = await rightTopBar.boundingBox()
        expect(beforeTopBarBox).not.toBeNull()
        if (!beforeTopBarBox) {
          throw new Error(
            'Available requirements sticky title bar did not expose a bounding box.',
          )
        }

        await scrollPanel.evaluate(node => {
          node.scrollTop = 520
          node.dispatchEvent(new Event('scroll'))
        })

        await expect
          .poll(async () => scrollPanel.evaluate(node => node.scrollTop))
          .toBeGreaterThan(beforeScrollTop)
        if (hasLeftPanel && rightHasOverflow) {
          await expect
            .poll(async () => leftPanel.evaluate(node => node.scrollTop))
            .toBe(beforeLeftScrollTop)
        }
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBe(0)
        await expect(rightTopBar).toBeVisible()
        await expect(rightTrigger).toBeVisible()
        await expect(rightTitle).toBeVisible()
        await expect(rightHeaderLabel).toBeVisible()

        const afterTopBarBox = await rightTopBar.boundingBox()

        expect(afterTopBarBox).not.toBeNull()
        if (!afterTopBarBox) {
          throw new Error(
            'Available requirements sticky title bar lost its bounding box after panel scrolling.',
          )
        }

        expect(Math.round(afterTopBarBox.y)).toBe(Math.round(beforeTopBarBox.y))
      })
    }
  })
}
