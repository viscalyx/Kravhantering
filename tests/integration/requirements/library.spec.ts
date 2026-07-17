import { expect, type Locator, type Page, test } from '@playwright/test'
import { delay, escapeRegExp } from '@/tests/helpers/common'

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

async function filterRequirementId(
  page: Page,
  uniqueId: string,
  locale: 'en' | 'sv' = 'sv',
) {
  const filterButtonName =
    locale === 'en' ? 'Filter by Requirement ID' : 'Filtrera efter Krav-ID'
  const textboxName = locale === 'en' ? 'Requirement ID' : 'Krav-ID'

  await page.getByRole('button', { name: filterButtonName }).click()
  await page.getByRole('textbox', { name: textboxName }).fill(uniqueId)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(uniqueId)}\\b`, 'u'),
    }),
  ).toHaveCount(1)
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

  test('REQ-01: an invalid continuation cursor refreshes and announces the list', async ({
    page,
  }) => {
    let firstPageRequests = 0
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
    const baseline = await page.evaluate(async () => {
      const response = await fetch(
        '/api/requirements?limit=200&locale=sv&sortBy=uniqueId&sortDirection=desc&statuses=3',
      )
      if (!response.ok) {
        throw new Error(
          `Failed to load cursor test baseline: ${response.status}`,
        )
      }
      return (await response.json()) as {
        pagination: Record<string, unknown>
        requirements: unknown[]
      }
    })

    await page.route('**/api/requirements?*', async route => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.searchParams.has('cursor')) {
        await route.fulfill({
          contentType: 'application/json',
          json: { code: 'invalid_cursor', error: 'Invalid cursor' },
          status: 400,
        })
        return
      }

      firstPageRequests += 1
      if (firstPageRequests === 1) {
        await route.fulfill({
          json: {
            ...baseline,
            pagination: {
              ...baseline.pagination,
              hasMore: true,
              nextCursor: 'stale-cursor',
            },
          },
        })
        return
      }

      await route.fulfill({ json: baseline })
    })

    await page.getByRole('button', { name: 'Sortera efter Krav-ID' }).click()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    await expect(
      page.getByRole('status').filter({
        hasText: 'Kravlistan ändrades och lästes in på nytt från början.',
      }),
    ).toBeVisible({ timeout: 30_000 })
    expect(firstPageRequests).toBeGreaterThanOrEqual(2)
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
    await filterRequirementId(page, 'INT0001', 'en')

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
    await expect(
      page.getByRole('button', { name: 'Ta bort INT0001' }),
    ).toHaveCount(0)
    await filterRequirementId(page, 'INT0002')
  })

  test('REQ-03: column-search clear control keeps a 24 CSS-pixel target at responsive widths', async ({
    page,
  }) => {
    for (const viewport of [
      { height: 720, width: 1280 },
      { height: 720, width: 375 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/sv/requirements')

      await page.getByRole('button', { name: 'Filtrera efter Krav-ID' }).click()
      const textbox = page.getByRole('textbox', { name: 'Krav-ID' })
      await textbox.fill('INT0001')

      const clearButton = page.getByRole('button', { name: 'Rensa' })
      await expect(clearButton).toBeVisible()

      const clearButtonBox = await clearButton.boundingBox()
      expect(clearButtonBox).not.toBeNull()
      expect(clearButtonBox?.height ?? 0).toBeGreaterThanOrEqual(24)
      expect(clearButtonBox?.width ?? 0).toBeGreaterThanOrEqual(24)

      await clearButton.click()
      await expect(textbox).toHaveValue('')
    }
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
    const getVisibleRows = () =>
      page
        .getByRole('table', { name: 'Lista över krav' })
        .getByRole('row')
        .evaluateAll(rows =>
          rows
            .slice(1)
            .map(row => row.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(Boolean),
        )

    await descriptionSortButton.click()
    await expect(descriptionHeader).toHaveAttribute('aria-sort', 'ascending')
    const ascendingRows = await getVisibleRows()
    await descriptionSortButton.click()
    await expect(descriptionHeader).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(getVisibleRows).not.toEqual(ascendingRows)
  })

  test('REQ-04: cursor boundaries match an equivalent larger page for every sort', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')
    const result = await page.evaluate(async () => {
      const sorts = [
        'uniqueId',
        'description',
        'area',
        'category',
        'type',
        'qualityCharacteristic',
        'priorityLevel',
        'status',
        'version',
      ]
      const failures: string[] = []

      async function loadPage(
        sortBy: string,
        sortDirection: 'asc' | 'desc',
        limit: number,
        cursor?: string,
      ) {
        const params = new URLSearchParams({
          limit: String(limit),
          locale: 'sv',
          sortBy,
          sortDirection,
        })
        if (cursor) params.set('cursor', cursor)
        const response = await fetch(`/api/requirements?${params}`)
        if (!response.ok) {
          throw new Error(
            `${sortBy}/${sortDirection}: ${response.status} ${await response.text()}`,
          )
        }
        return (await response.json()) as {
          pagination: { nextCursor: string | null }
          requirements: Array<{ id: number }>
        }
      }

      for (const sortBy of sorts) {
        for (const sortDirection of ['asc', 'desc'] as const) {
          const reference = await loadPage(sortBy, sortDirection, 4)
          const first = await loadPage(sortBy, sortDirection, 1)
          const second = first.pagination.nextCursor
            ? await loadPage(
                sortBy,
                sortDirection,
                3,
                first.pagination.nextCursor,
              )
            : { pagination: { nextCursor: null }, requirements: [] }
          const expected = reference.requirements.map(row => row.id)
          const actual = [...first.requirements, ...second.requirements].map(
            row => row.id,
          )
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            failures.push(`${sortBy}/${sortDirection}`)
          }
        }
      }

      return failures
    })

    expect(result).toEqual([])
  })

  test('REQ-10a: complete CSV export uses the dedicated unpaged endpoint', async ({
    page,
  }) => {
    const exportedIds = Array.from(
      { length: 205 },
      (_, index) => `EXP${String(index + 1).padStart(4, '0')}`,
    )
    let exportUrl: URL | undefined
    await page.goto('/sv/requirements')
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()

    await page.route('**/api/requirements/export?*', async route => {
      exportUrl = new URL(route.request().url())
      await route.fulfill({
        body: [
          '\uFEFF"Krav-ID","Kravtext"',
          ...exportedIds.map(id => `"${id}","Requirement ${id}"`),
        ].join('\r\n'),
        headers: {
          'Content-Disposition': 'attachment; filename="kravbibliotek.csv"',
          'Content-Type': 'text/csv; charset=utf-8',
        },
        status: 200,
      })
    })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportera' }).click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    let csv = ''
    for await (const chunk of stream) {
      csv += chunk.toString()
    }

    expect(exportUrl).toBeDefined()
    expect(exportUrl?.searchParams.has('cursor')).toBe(false)
    expect(exportUrl?.searchParams.has('limit')).toBe(false)
    expect(download.suggestedFilename()).toBe('kravbibliotek.csv')
    expect(
      csv
        .split(/\r?\n/u)
        .slice(1)
        .map(line => line.match(/^"(EXP\d{4})"/u)?.[1]),
    ).toEqual(exportedIds)
  })

  test('REQ-09: inline detail orders text, criteria, metadata, references, and packages', async ({
    page,
  }) => {
    const detailPane = await openRequirementDetail(page, 'INT0001')

    const sectionOrder = await detailPane.evaluate(root => {
      const wantedLabels = new Set([
        'Kravtext',
        'Acceptanskriterier',
        'Kravområde',
        'Normreferenser',
        'Kravpaket',
      ])

      return Array.from(root.querySelectorAll('h3, dt'))
        .map(element => {
          const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
          return text === 'Acceptanskriterium' || text === 'Acceptanskriterier'
            ? 'Acceptanskriterier'
            : text
        })
        .filter(text => wantedLabels.has(text))
    })

    expect(sectionOrder.indexOf('Kravtext')).toBeGreaterThanOrEqual(0)
    expect(sectionOrder.indexOf('Acceptanskriterier')).toBeGreaterThan(
      sectionOrder.indexOf('Kravtext'),
    )
    expect(sectionOrder.indexOf('Kravområde')).toBeGreaterThan(
      sectionOrder.indexOf('Acceptanskriterier'),
    )
    expect(sectionOrder.indexOf('Normreferenser')).toBeGreaterThan(
      sectionOrder.indexOf('Kravområde'),
    )
    expect(sectionOrder.indexOf('Kravpaket')).toBeGreaterThan(
      sectionOrder.indexOf('Normreferenser'),
    )
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
