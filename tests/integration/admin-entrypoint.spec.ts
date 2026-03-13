import { expect, type Page, test } from '@playwright/test'

const viewportVariants = [
  {
    name: 'desktop',
    viewport: { height: 720, width: 1280 },
  },
  {
    name: 'mobile',
    viewport: { height: 812, width: 375 },
  },
] as const

async function getAdminColumnOrder(page: Page) {
  return page
    .locator('[data-testid^="admin-column-row-"]')
    .evaluateAll(nodes =>
      nodes
        .map(node =>
          node.getAttribute('data-testid')?.replace('admin-column-row-', ''),
        )
        .filter((value): value is string => Boolean(value)),
    )
}

async function setAdminColumnOrder(page: Page, targetOrder: string[]) {
  for (
    let guard = 0;
    guard < targetOrder.length * targetOrder.length;
    guard++
  ) {
    const currentOrder = await getAdminColumnOrder(page)

    if (currentOrder.join('|') === targetOrder.join('|')) {
      return
    }

    const targetIndex = currentOrder.findIndex(
      (columnId, index) => columnId !== targetOrder[index],
    )
    if (targetIndex < 0) {
      return
    }

    const columnId = targetOrder[targetIndex]
    await page
      .getByTestId(`admin-column-row-${columnId}`)
      .getByRole('button', { name: 'Flytta upp' })
      .click()
  }

  throw new Error('Could not apply the requested admin column order.')
}

function swapColumns(order: string[], leftId: string, rightId: string) {
  const nextOrder = [...order]
  const leftIndex = nextOrder.indexOf(leftId)
  const rightIndex = nextOrder.indexOf(rightId)

  if (leftIndex < 0 || rightIndex < 0) {
    return nextOrder
  }

  ;[nextOrder[leftIndex], nextOrder[rightIndex]] = [
    nextOrder[rightIndex],
    nextOrder[leftIndex],
  ]

  return nextOrder
}

for (const { name, viewport } of viewportVariants) {
  test.describe(`admin entrypoint (${name})`, () => {
    test.use({ viewport })

    test('header settings link opens the Swedish admin center', async ({
      page,
    }) => {
      await page.goto('/sv/kravkatalog')

      await expect(
        page.getByRole('button', { name: 'Referensdata' }),
      ).toHaveCount(0)

      const settingsLink = page.getByRole('link', { name: 'Inställningar' })
      await expect(settingsLink).toBeVisible()
      await expect(settingsLink).toHaveAttribute('href', '/sv/admin')

      await settingsLink.click()
      await expect(page).toHaveURL('/sv/admin')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Administrationscenter',
      )
    })

    test(`persists terminology and column changes through catalog reloads (${name})`, async ({
      page,
    }) => {
      await page.goto('/sv/admin')

      const categoryCard = page.locator('article').filter({
        has: page.getByText('Kategorier', { exact: true }),
      })
      const categorySingularInput = categoryCard.getByLabel('Singular')
      const originalCategoryLabel = await categorySingularInput.inputValue()
      const renamedCategoryLabel = `${originalCategoryLabel} test`
      await page.getByRole('button', { name: 'Kolumner' }).click()
      const originalOrder = await getAdminColumnOrder(page)
      const targetOrder = swapColumns(originalOrder, 'area', 'category')

      try {
        await page.getByRole('button', { name: 'Benämningar' }).click()
        await categorySingularInput.fill(renamedCategoryLabel)
        await page.getByRole('button', { name: 'Spara' }).click()
        await expect(page.getByText('Sparat')).toBeVisible()

        await page.getByRole('button', { name: 'Kolumner' }).click()
        await setAdminColumnOrder(page, targetOrder)
        await page.getByRole('button', { name: 'Spara' }).click()
        await expect(page.getByText('Sparat')).toBeVisible()

        await page.goto('/sv/kravkatalog')
        await expect(page.locator('thead')).toContainText(renamedCategoryLabel)

        const readHeaderTexts = async () =>
          page
            .locator('thead th')
            .evaluateAll(nodes =>
              nodes.map(
                node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
              ),
            )

        const headerTexts = await readHeaderTexts()
        const categoryIndex = headerTexts.findIndex(text =>
          text.includes(renamedCategoryLabel),
        )
        const areaIndex = headerTexts.findIndex(text => text.includes('Område'))

        expect(categoryIndex).toBeGreaterThanOrEqual(0)
        expect(areaIndex).toBeGreaterThanOrEqual(0)
        expect(categoryIndex < areaIndex).toBe(
          targetOrder.indexOf('category') < targetOrder.indexOf('area'),
        )

        await page.reload()
        await expect(page.locator('thead')).toContainText(renamedCategoryLabel)

        await page.goto('/sv/admin')
        await expect(categorySingularInput).toHaveValue(renamedCategoryLabel)

        await page.getByRole('button', { name: 'Kolumner' }).click()
        await expect
          .poll(async () => getAdminColumnOrder(page))
          .toEqual(targetOrder)
      } finally {
        await page.goto('/sv/admin')

        const restoredCategoryInput = page
          .locator('article')
          .filter({
            has: page.getByText('Kategorier', { exact: true }),
          })
          .getByLabel('Singular')

        if (
          (await restoredCategoryInput.inputValue()) !== originalCategoryLabel
        ) {
          await restoredCategoryInput.fill(originalCategoryLabel)
          await page.getByRole('button', { name: 'Spara' }).click()
          await expect(page.getByText('Sparat')).toBeVisible()
        }

        await page.getByRole('button', { name: 'Kolumner' }).click()
        const currentOrder = await getAdminColumnOrder(page)
        if (currentOrder.join('|') !== originalOrder.join('|')) {
          await setAdminColumnOrder(page, originalOrder)
          await page.getByRole('button', { name: 'Spara' }).click()
          await expect(page.getByText('Sparat')).toBeVisible()
        }
      }
    })
  })
}

for (const locale of ['sv', 'en'] as const) {
  test(`admin page loads for ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/admin`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      locale === 'sv' ? 'Administrationscenter' : 'Admin center',
    )
  })
}
