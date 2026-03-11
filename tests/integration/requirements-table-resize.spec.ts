import { expect, test } from '@playwright/test'

// Keep this in sync with getRequirementColumnWidthsStorageKey('sv')
// in lib/requirements/list-view.ts.
const DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY = 'kravkatalog.columnWidths.v2.sv'

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

test.describe('Requirements table column resizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.localStorage.clear()
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('resizes the description column during rapid dragging without render-loop errors', async ({
        page,
      }) => {
        const consoleErrors: string[] = []
        const pageErrors: string[] = []

        page.on('console', message => {
          if (message.type() === 'error') {
            consoleErrors.push(message.text())
          }
        })
        page.on('pageerror', error => {
          pageErrors.push(error.message)
        })

        await page.goto('/sv/kravkatalog')

        const handle = page
          .locator('[data-column-resize-handle="description"]')
          .first()
        const laterDivider = page
          .locator('[data-column-resize-handle="area"]')
          .first()
        const descriptionColumn = page.locator('colgroup col').nth(1)

        await handle.scrollIntoViewIfNeeded()
        await expect(handle).toBeVisible()
        await expect(laterDivider).toBeVisible()

        const beforeWidth = await descriptionColumn.evaluate(
          node => (node as HTMLTableColElement).style.width,
        )
        const box = await handle.boundingBox()
        const laterDividerBox = await laterDivider.boundingBox()

        expect(box).not.toBeNull()
        if (!box) {
          throw new Error(
            'Description resize handle did not expose a bounding box.',
          )
        }
        expect(laterDividerBox).not.toBeNull()
        if (!laterDividerBox) {
          throw new Error('Area resize handle did not expose a bounding box.')
        }

        const startX = box.x + box.width / 2
        const pointerY = box.y + Math.min(box.height / 2, 24)
        const deltas = [56, -28, 88, -20, 104, -12, 128]

        await page.mouse.move(startX, pointerY)
        await page.mouse.down()
        await page.mouse.move(startX + deltas[0], pointerY, { steps: 3 })

        await expect
          .poll(async () => {
            const nextBox = await laterDivider.boundingBox()
            return nextBox ? Math.round(nextBox.x) : -1
          })
          .toBeGreaterThan(Math.round(laterDividerBox.x))

        for (const delta of deltas.slice(1)) {
          await page.mouse.move(startX + delta, pointerY, { steps: 3 })
        }

        await page.mouse.up()

        await expect
          .poll(async () =>
            descriptionColumn.evaluate(
              node => (node as HTMLTableColElement).style.width,
            ),
          )
          .not.toBe(beforeWidth)

        await expect
          .poll(async () =>
            page.evaluate(
              storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
              DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY,
            ),
          )
          .toContain('"description"')

        const renderLoopErrors = [...consoleErrors, ...pageErrors].filter(
          message =>
            /Maximum update depth exceeded|too many re-renders/i.test(message),
        )

        expect(renderLoopErrors).toEqual([])
      })

      test('clips resize handles around an expanded detail pane and still resizes', async ({
        page,
      }) => {
        await page.goto('/sv/kravkatalog')

        const firstRow = page.locator('tbody > tr').first()
        const firstRowUniqueIdCell = firstRow.locator('td').first()
        const secondRow = page.locator('tbody > tr').nth(1)

        await expect(firstRow).toBeVisible()
        await expect(secondRow).toBeVisible()
        await expect(firstRowUniqueIdCell).toBeVisible()

        await firstRowUniqueIdCell.click({ position: { x: 24, y: 20 } })

        const detailCell = page.locator('[data-expanded-detail-cell="true"]')
        const handle = page
          .locator('[data-column-resize-handle="description"]')
          .first()
        const bottomSegment = page
          .locator(
            '[data-column-resize-column="description"][data-column-resize-segment="bottom"]',
          )
          .first()
        const descriptionColumn = page.locator('colgroup col').nth(1)

        await expect(detailCell).toBeVisible()
        await expect(handle).toBeVisible()
        await expect(bottomSegment).toBeVisible()
        await bottomSegment.scrollIntoViewIfNeeded()

        const detailBox = await detailCell.boundingBox()
        const topHandleBox = await handle.boundingBox()
        const bottomSegmentBox = await bottomSegment.boundingBox()

        expect(detailBox).not.toBeNull()
        if (!detailBox) {
          throw new Error('Expanded detail pane did not expose a bounding box.')
        }
        expect(topHandleBox).not.toBeNull()
        if (!topHandleBox) {
          throw new Error('Top resize handle did not expose a bounding box.')
        }
        expect(bottomSegmentBox).not.toBeNull()
        if (!bottomSegmentBox) {
          throw new Error('Bottom resize segment did not expose a bounding box.')
        }

        expect(Math.round(topHandleBox.y + topHandleBox.height)).toBeLessThanOrEqual(
          Math.round(detailBox.y),
        )
        expect(Math.round(bottomSegmentBox.y)).toBeGreaterThanOrEqual(
          Math.round(detailBox.y + detailBox.height),
        )

        const beforeWidth = await descriptionColumn.evaluate(
          node => (node as HTMLTableColElement).style.width,
        )
        const pointerId = 1
        const startX = bottomSegmentBox.x + bottomSegmentBox.width / 2
        const pointerY =
          bottomSegmentBox.y + Math.min(bottomSegmentBox.height / 2, 24)

        await bottomSegment.dispatchEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: startX,
          clientY: pointerY,
          isPrimary: true,
          pointerId,
          pointerType: 'mouse',
        })
        await page.evaluate(
          ({ endX, pointerId, pointerY }) => {
            window.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                button: 0,
                clientX: endX,
                clientY: pointerY,
                isPrimary: true,
                pointerId,
                pointerType: 'mouse',
              }),
            )
            window.dispatchEvent(
              new PointerEvent('pointerup', {
                bubbles: true,
                button: 0,
                clientX: endX,
                clientY: pointerY,
                isPrimary: true,
                pointerId,
                pointerType: 'mouse',
              }),
            )
          },
          {
            endX: startX + 64,
            pointerId,
            pointerY,
          },
        )

        await expect
          .poll(async () =>
            descriptionColumn.evaluate(
              node => (node as HTMLTableColElement).style.width,
            ),
          )
          .not.toBe(beforeWidth)

        await expect
          .poll(async () =>
            page.evaluate(
              storageKey => globalThis.localStorage.getItem(storageKey) ?? '',
              DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY,
            ),
          )
          .toContain('"description"')
      })
    })
  }
})
