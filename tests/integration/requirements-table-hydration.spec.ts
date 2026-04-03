import { expect, type Page, test } from '@playwright/test'

const COLUMN_VISIBILITY_STORAGE_KEY = 'requirements.visibleColumns.v3'
const COLUMN_WIDTHS_STORAGE_KEY = 'requirements.columnWidths.v3.sv'

async function expectInitialLoadingState(page: Page) {
  await expect(page.getByText(/Hämtar krav/)).toBeVisible()
  await expect(page.getByText('Inga resultat hittades')).toHaveCount(0)
  await expect(page.locator('thead th')).toHaveCount(0)
}

async function expectHydratedTable(page: Page) {
  // 5 columns: checkbox + uniqueId + description + area + status
  await expect(page.locator('thead th')).toHaveCount(5)

  await expect
    .poll(async () =>
      page
        .locator('thead th')
        .evaluateAll(nodes =>
          nodes.map(
            node =>
              node.textContent
                ?.replace(/\s+/g, ' ')
                .replace(/\d.*$/, '')
                .trim() ?? '',
          ),
        ),
    )
    .toEqual(['', 'Krav-ID', 'Kravtext', 'Område', 'Status'])

  // col index 4 = status (0=checkbox, 1=uniqueId, 2=description, 3=area, 4=status)
  await expect
    .poll(async () =>
      page
        .locator('colgroup col')
        .nth(4)
        .evaluate(node => (node as HTMLTableColElement).style.width),
    )
    .toBe('220px')
}

for (const viewportConfig of [
  {
    name: 'desktop',
    viewport: { height: 720, width: 1280 },
  },
  {
    name: 'mobile',
    viewport: { height: 812, width: 375 },
  },
]) {
  test.describe(`Requirements table hydration (${viewportConfig.name})`, () => {
    test.use({ viewport: viewportConfig.viewport })

    test(`uses persisted columns and widths on the first visible render and after reload (${viewportConfig.name})`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({
          columnVisibilityStorageKey,
          columnWidthsStorageKey,
        }: {
          columnVisibilityStorageKey: string
          columnWidthsStorageKey: string
        }) => {
          globalThis.localStorage.clear()
          globalThis.localStorage.setItem(
            columnVisibilityStorageKey,
            '["area","status"]',
          )
          globalThis.localStorage.setItem(
            columnWidthsStorageKey,
            '{"status":220}',
          )
        },
        {
          columnVisibilityStorageKey: COLUMN_VISIBILITY_STORAGE_KEY,
          columnWidthsStorageKey: COLUMN_WIDTHS_STORAGE_KEY,
        },
      )

      await page.route('**/api/requirements?*', async route => {
        await new Promise(resolve => setTimeout(resolve, 700))
        await route.continue()
      })

      await page.goto('/sv/requirements')

      await expectInitialLoadingState(page)
      await expectHydratedTable(page)

      await page.reload()

      await expectInitialLoadingState(page)
      await expectHydratedTable(page)
    })
  })
}
