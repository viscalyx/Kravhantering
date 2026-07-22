import { expect, type Page, test } from '@playwright/test'

// Keep this in sync with getRequirementColumnWidthsStorageKey('sv')
// in lib/requirements/list-view.ts.
const DESCRIPTION_COLUMN_WIDTHS_STORAGE_KEY = 'requirements.columnWidths.v5.sv'

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

async function openFirstRequirementDetail(page: Page) {
  const firstRow = page.locator('tbody > tr').first()
  // Skip the checkbox td (index 0) — uniqueId is at index 1
  const firstRowUniqueIdCell = firstRow.locator('td').nth(1)
  const secondRow = page.locator('tbody > tr').nth(1)
  const detailCell = page.locator('[data-expanded-detail-cell="true"]').first()

  await expect(firstRow).toBeVisible()
  await expect(secondRow).toBeVisible()
  await expect(firstRowUniqueIdCell).toBeVisible()

  await firstRowUniqueIdCell.click({ position: { x: 24, y: 20 } })
  await expect(detailCell).toBeVisible()

  return { detailCell }
}

async function getScrollY(page: Page) {
  return page.evaluate(() => window.scrollY)
}

test.describe('Requirements table column resizing', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.localStorage.clear()
    })
  })

  for (const { name, viewport } of viewportVariants) {
    test.describe(`${name} viewport`, () => {
      test.use({ viewport })

      test('REQ-09: clips resize handles around an expanded detail pane and still resizes', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')
        const { detailCell } = await openFirstRequirementDetail(page)
        const handle = page
          .locator('[data-column-resize-handle="description"]')
          .first()
        const bottomSegment = page
          .locator(
            '[data-column-resize-column="description"][data-column-resize-segment="bottom"]',
          )
          .first()
        const descriptionColumn = page.locator('colgroup col').nth(2)

        await expect(detailCell).toBeVisible()
        await expect(handle).toBeVisible()
        await expect(bottomSegment).toBeVisible()

        const getResizeBoxes = async () => {
          const detailBox = await detailCell.boundingBox()
          const topHandleBox = await handle.boundingBox()
          const bottomSegmentBox = await bottomSegment.boundingBox()

          expect(detailBox).not.toBeNull()
          if (!detailBox) {
            throw new Error(
              'Expanded detail pane did not expose a bounding box.',
            )
          }
          expect(topHandleBox).not.toBeNull()
          if (!topHandleBox) {
            throw new Error('Top resize handle did not expose a bounding box.')
          }
          expect(bottomSegmentBox).not.toBeNull()
          if (!bottomSegmentBox) {
            throw new Error(
              'Bottom resize segment did not expose a bounding box.',
            )
          }

          return { bottomSegmentBox, detailBox, topHandleBox }
        }

        await expect
          .poll(async () => {
            const { bottomSegmentBox, detailBox, topHandleBox } =
              await getResizeBoxes()
            return (
              Math.round(topHandleBox.y + topHandleBox.height) <=
                Math.round(detailBox.y) &&
              Math.round(bottomSegmentBox.y) >=
                Math.round(detailBox.y + detailBox.height) &&
              Math.round(bottomSegmentBox.height) <= 48
            )
          })
          .toBe(true)

        const { bottomSegmentBox, detailBox, topHandleBox } =
          await getResizeBoxes()

        expect(
          Math.round(topHandleBox.y + topHandleBox.height),
        ).toBeLessThanOrEqual(Math.round(detailBox.y))
        expect(Math.round(bottomSegmentBox.y)).toBeGreaterThanOrEqual(
          Math.round(detailBox.y + detailBox.height),
        )
        expect(Math.round(bottomSegmentBox.height)).toBeLessThanOrEqual(48)

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

      test('REQ-08: scrolls immediately up and down after opening an inline detail pane', async ({
        page,
      }) => {
        await page.goto('/sv/requirements')

        const { detailCell } = await openFirstRequirementDetail(page)

        await expect(detailCell).toBeVisible()

        const detailBox = await detailCell.boundingBox()

        expect(detailBox).not.toBeNull()
        if (!detailBox) {
          throw new Error('Expanded detail pane did not expose a bounding box.')
        }

        const viewportSize = page.viewportSize()
        const viewportHeight = viewportSize?.height ?? viewport.height
        const viewportWidth = viewportSize?.width ?? viewport.width

        // Find a probe point below the detail pane that does not overlap
        // any bottom resize-segment strip.  Segments are narrow vertical
        // strips at column borders; we query their actual positions so the
        // probe is placed in a clear gap between them.
        const probePoint = await page.evaluate(
          ({ detailBottom, vpHeight, vpWidth }) => {
            const bottomSegments = Array.from(
              document.querySelectorAll(
                '[data-column-resize-segment="bottom"]',
              ),
            )
            const rects = bottomSegments.map(s => {
              const r = s.getBoundingClientRect()
              return {
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                top: r.top,
              }
            })
            const maxSegBottom = rects.reduce(
              (m, r) => Math.max(m, r.bottom),
              0,
            )

            // Pick y below the tallest bottom segment, clamped to viewport.
            const candidateY =
              maxSegBottom > 0
                ? Math.round(maxSegBottom + 16)
                : Math.round(detailBottom + 128)
            const y = Math.min(vpHeight - 32, candidateY)

            // Pick x in the horizontal centre; if that overlaps a segment
            // at the chosen y, nudge right past its right edge.
            let x = Math.round(vpWidth / 2)
            for (const r of rects) {
              if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
                x = Math.round(r.right + 8)
                break
              }
            }

            return { x: Math.min(x, vpWidth - 32), y }
          },
          {
            detailBottom: detailBox.y + detailBox.height,
            vpHeight: viewportHeight,
            vpWidth: viewportWidth,
          },
        )

        const targetAtProbe = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y)

          return {
            resizeSegment:
              el?.getAttribute('data-column-resize-segment') ?? null,
            tagName: el?.tagName ?? null,
          }
        }, probePoint)

        expect(targetAtProbe.resizeSegment).toBeNull()

        await page.mouse.move(probePoint.x, probePoint.y)

        const beforeDown = await getScrollY(page)
        await page.mouse.wheel(0, 180)
        await expect.poll(() => getScrollY(page)).toBeGreaterThan(beforeDown)

        const afterDown = await getScrollY(page)
        await page.mouse.move(probePoint.x, probePoint.y)
        await page.mouse.wheel(0, -180)
        await expect.poll(() => getScrollY(page)).toBeLessThan(afterDown)

        const afterUp = await getScrollY(page)
        await page.mouse.move(probePoint.x, probePoint.y)
        await page.mouse.wheel(0, 180)
        await expect.poll(() => getScrollY(page)).toBeGreaterThan(afterUp)
      })
    })
  }
})
