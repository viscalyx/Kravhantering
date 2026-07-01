import { expect, type Locator, type Page, test } from '@playwright/test'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function openRequirementDetail(
  page: Page,
  uniqueId = 'INT0001',
): Promise<Locator> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(
      `/sv/requirements?selected=${encodeURIComponent(uniqueId)}`,
      { timeout: 30_000, waitUntil: 'domcontentloaded' },
    )

    try {
      const rowButton = page.getByRole('button', {
        name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`),
      })
      await expect(rowButton).toBeVisible({ timeout: 30_000 })

      const detailPaneId = await rowButton.getAttribute('aria-controls')
      if (!detailPaneId) {
        throw new Error(
          `Requirement row ${uniqueId} has no detail pane target.`,
        )
      }

      const detailPane = page.locator(`#${detailPaneId}`)
      await expect(detailPane).toBeVisible({ timeout: 30_000 })
      return detailPane
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement row ${uniqueId} did not load.`)
}

async function expectRequirementDetailRoute(
  page: Page,
  path: string,
  expectedUrl: RegExp,
  uniqueId = 'INT0001',
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(path, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(expectedUrl, { timeout: 30_000 })

    try {
      await expect(
        page.getByRole('heading', { name: new RegExp(escapeRegExp(uniqueId)) }),
      ).toBeVisible({ timeout: 30_000 })
      return
    } catch (error) {
      if (attempt === 2) throw error
      await delay(750 * (attempt + 1))
    }
  }

  throw new Error(`Requirement detail route ${path} did not load.`)
}

test.describe('Requirements library', () => {
  test.setTimeout(120_000)
  test.use({ viewport: { height: 720, width: 1280 } })

  test('REQ-01: requirements library loads seeded requirements and opens detail metadata', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page, 'INT0001')

    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
    await expect(detailPane).toContainText('Kravtext')
    await expect(detailPane).toContainText('Kravområde')
  })

  test('REQ-02: language switch keeps the requirements table usable', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Byt språk' }).click()
    await expect(page).toHaveURL(/\/en\/requirements$/)
    await expect(
      page.getByRole('table', { name: 'Requirements list' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^INT0001\b/ })).toBeVisible()

    await page.getByRole('button', { name: 'Switch language' }).click()
    await expect(page).toHaveURL(/\/sv\/requirements$/)
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
  })

  test('REQ-03: requirement id filter narrows and clears the requirements table', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    await page.getByRole('button', { name: 'Filtrera efter Krav-ID' }).click()
    await page.getByRole('textbox', { name: 'Krav-ID' }).fill('INT0001')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('button', { name: /^INT0001\b/ })).toHaveCount(
      1,
    )
    await expect(page.getByRole('button', { name: /^INT0002\b/ })).toHaveCount(
      0,
    )

    await page.getByRole('button', { name: 'Ta bort INT0001' }).click()
    await expect(page.getByRole('button', { name: /^INT0002\b/ })).toBeVisible()
  })

  test('REQ-04: sortable requirement columns update the sort direction', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    const descriptionHeader = page.locator(
      '[data-requirement-semantic-header-label="description"]',
    )
    const descriptionSortButton = page.getByRole('button', {
      name: 'Sortera efter Kravtext',
    })

    await descriptionSortButton.click()
    await expect(descriptionHeader).toHaveAttribute('aria-sort', 'ascending')
    await descriptionSortButton.click()
    await expect(descriptionHeader).toHaveAttribute('aria-sort', 'descending')
  })

  test('REQ-11: Swedish krav aliases redirect to canonical requirement detail routes', async ({
    page,
  }) => {
    await expectRequirementDetailRoute(
      page,
      '/krav/INT0001',
      /\/sv\/requirements\/INT0001$/,
    )

    await expectRequirementDetailRoute(
      page,
      '/sv/krav/INT0001',
      /\/sv\/requirements\/INT0001$/,
    )

    await expectRequirementDetailRoute(
      page,
      '/en/krav/INT0001',
      /\/en\/requirements\/INT0001$/,
    )
  })

  test('REQ-13: requirement detail share and report menus support keyboard use', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page, 'INT0001')

    const shareButton = detailPane.getByRole('button', { name: 'Dela' })
    await shareButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(':focus')).toHaveText(/länk/i)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()

    const reportsButton = detailPane.getByRole('button', { name: 'Rapporter' })
    await reportsButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(':focus')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
  })

  test('ADMIN-11: status and priority badges show labels with configured icons', async ({
    page,
  }) => {
    const requirementId = 'ANV0003'
    const detailPane = await openRequirementDetail(page, requirementId)

    await page.locator('[data-column-picker-trigger="true"]').click()
    const popover = page.locator('[data-column-picker-popover="true"]')
    for (const columnId of ['status', 'priorityLevel'] as const) {
      const checkbox = popover.locator(
        `[data-column-picker-option="${columnId}"] input[type="checkbox"]`,
      )
      if (!(await checkbox.isChecked())) {
        await checkbox.check()
      }
    }
    await page.keyboard.press('Escape')

    const row = page
      .getByRole('button', { name: new RegExp(`^${requirementId}\\b`) })
      .locator('xpath=ancestor::tr[1]')
    const publishedBadge = row.locator('.status-badge').filter({
      hasText: 'Publicerad',
    })
    const priorityBadge = row.locator('.status-badge').filter({
      hasText: /P[1-4]/,
    })

    await expect(publishedBadge).toHaveCount(1)
    await expect(publishedBadge.locator('svg')).toHaveCount(1)
    await expect(priorityBadge).toHaveCount(1)
    await expect(priorityBadge.locator('svg')).toHaveCount(1)

    const workflow = detailPane.getByRole('group', {
      name: 'Arbetsflöde för kravversionsstatus',
    })
    await expect(workflow).toContainText('Publicerad')
    await expect
      .poll(async () => workflow.locator('svg').count())
      .toBeGreaterThan(0)
  })
})
