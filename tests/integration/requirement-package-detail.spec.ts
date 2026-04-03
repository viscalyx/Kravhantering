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

        await expect(leftPanel).toBeVisible()
        await expect(rightPanel).toBeVisible()
        await expect(leftTopBar).toBeVisible()
        await expect(leftTrigger).toBeVisible()
        await expect(leftTitle).toBeVisible()
        await expect(leftHeaderLabel).toBeVisible()
        await expect(rightTopBar).toBeVisible()
        await expect(rightTrigger).toBeVisible()
        await expect(rightTitle).toBeVisible()
        await expect(rightHeaderLabel).toBeVisible()
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBe(0)

        let [leftHasOverflow, rightHasOverflow] = await Promise.all([
          leftPanel.evaluate(
            node => node.scrollHeight > node.clientHeight + 50,
          ),
          rightPanel.evaluate(
            node => node.scrollHeight > node.clientHeight + 50,
          ),
        ])

        if (!leftHasOverflow && !rightHasOverflow) {
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

        const [
          beforeLeftScrollTop,
          beforeRightScrollTop,
          leftPanelBox,
          rightPanelBox,
        ] = await Promise.all([
          leftPanel.evaluate(node => node.scrollTop),
          rightPanel.evaluate(node => node.scrollTop),
          leftPanel.boundingBox(),
          rightPanel.boundingBox(),
        ])

        expect(leftPanelBox).not.toBeNull()
        expect(rightPanelBox).not.toBeNull()
        if (!leftPanelBox || !rightPanelBox) {
          throw new Error(
            'Package detail split panels did not expose bounding boxes.',
          )
        }

        expect(leftPanelBox.x).toBeLessThanOrEqual(8)
        expect(rightPanelBox.x + rightPanelBox.width).toBeGreaterThanOrEqual(
          activeViewportWidth - 8,
        )
        expect(leftPanelBox.y + leftPanelBox.height).toBeLessThanOrEqual(
          activeViewportHeight,
        )
        expect(rightPanelBox.y + rightPanelBox.height).toBeLessThanOrEqual(
          activeViewportHeight,
        )
        if (!leftHasOverflow && !rightHasOverflow) {
          return
        }
        const scrollPanel = rightHasOverflow ? rightPanel : leftPanel
        const stationaryPanel = rightHasOverflow ? leftPanel : rightPanel
        const beforeScrollTop = rightHasOverflow
          ? beforeRightScrollTop
          : beforeLeftScrollTop
        const beforeStationaryScrollTop = rightHasOverflow
          ? beforeLeftScrollTop
          : beforeRightScrollTop
        const activeTopBar = rightHasOverflow ? rightTopBar : leftTopBar
        const activeTrigger = rightHasOverflow ? rightTrigger : leftTrigger
        const activeTitle = rightHasOverflow ? rightTitle : leftTitle
        const activeHeaderLabel = rightHasOverflow
          ? rightHeaderLabel
          : leftHeaderLabel

        const beforeTopBarBox = await activeTopBar.boundingBox()
        expect(beforeTopBarBox).not.toBeNull()
        if (!beforeTopBarBox) {
          throw new Error(
            'Package detail sticky title bar did not expose a bounding box.',
          )
        }

        await scrollPanel.evaluate(node => {
          node.scrollTop = 520
          node.dispatchEvent(new Event('scroll'))
        })

        await expect
          .poll(async () => scrollPanel.evaluate(node => node.scrollTop))
          .toBeGreaterThan(beforeScrollTop)
        await expect
          .poll(async () => stationaryPanel.evaluate(node => node.scrollTop))
          .toBe(beforeStationaryScrollTop)
        await expect
          .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
          .toBe(0)
        await expect(activeTopBar).toBeVisible()
        await expect(activeTrigger).toBeVisible()
        await expect(activeTitle).toBeVisible()
        await expect(activeHeaderLabel).toBeVisible()

        const afterTopBarBox = await activeTopBar.boundingBox()

        expect(afterTopBarBox).not.toBeNull()
        if (!afterTopBarBox) {
          throw new Error(
            'Package detail sticky title bar lost its bounding box after panel scrolling.',
          )
        }

        expect(Math.round(afterTopBarBox.y)).toBe(Math.round(beforeTopBarBox.y))
      })
    }
  })
}
