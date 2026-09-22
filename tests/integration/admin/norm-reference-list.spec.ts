import { expect, test } from '@playwright/test'

const nisName = 'NIS2-direktivet – åtgärder för hög gemensam cybersäkerhetsnivå'
const norms = [0, 1, 14, 209].map((count, index) => ({
  id: index + 1,
  isArchived: index === 3,
  issuer: 'Europeiska unionens råd och Europaparlamentet',
  linkedRequirementCount: count,
  name: index === 0 ? nisName : `Norm ${count}`,
  normReferenceId: index === 0 ? 'EU 2022/2555' : `NR-${count}`,
  reference: index === 1 ? 'X'.repeat(180) : 'EU 2022/2555',
  type: 'Direktiv',
  updatedAt: '2026-04-20T20:07:00.000Z',
  uri: index === 0 ? 'https://eur-lex.europa.eu/eli/dir/2022/2555' : null,
  version: index === 0 ? null : '2022',
}))

for (const locale of ['sv', 'en'] as const) {
  test(`ADMIN-06B: complete norm information, desktop layout and narrow-screen access (${locale})`, async ({
    page,
  }, testInfo) => {
    await page.route('**/api/norm-references?includeArchived=true', route =>
      route.fulfill({ json: { normReferences: norms } }),
    )
    await page.route(/\/api\/norm-references\/\d+$/, route =>
      route.fulfill({ json: { linkedRequirements: [] } }),
    )
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light')
      localStorage.setItem(
        'requirements.navigationRail.expanded.v1',
        'collapsed',
      )
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/${locale}/requirements/stewardship?tab=norms`)
    const table = page.getByRole('table')
    const row = page.getByRole('row').filter({ hasText: nisName })
    await expect(table.getByRole('columnheader')).toHaveText(
      locale === 'sv'
        ? ['Benämning', 'Identifiering', 'Status och åtgärder']
        : ['Name', 'Identification', 'Status and actions'],
    )
    await expect(row.getByRole('definition')).toHaveText([
      'EU 2022/2555',
      'EU 2022/2555',
      '-',
      'Direktiv',
    ])
    await expect(table.getByRole('status')).toHaveText(
      locale === 'sv'
        ? ['Aktiv', 'Aktiv', 'Aktiv', 'Arkiverad']
        : ['Active', 'Active', 'Active', 'Archived'],
    )
    await expect(table.getByRole('link')).toHaveCount(1)
    await expect(
      table.getByRole('definition').filter({ hasText: 'X'.repeat(180) }),
    ).toHaveText('X'.repeat(180))

    for (const marker of [
      'norm name and issuer',
      'norm identification',
      'norm status and actions',
      'norm status',
    ]) {
      await expect(
        row.locator(`[data-developer-mode-name="${marker}"]`),
      ).toHaveCount(1)
    }
    const measurements = []
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
      for (const expanded of [false, true]) {
        const toggle = page.getByRole('button', {
          name:
            locale === 'sv'
              ? expanded
                ? 'Expandera navigation'
                : 'Fäll ihop navigation'
              : expanded
                ? 'Expand navigation'
                : 'Collapse navigation',
          exact: true,
        })
        if (await toggle.count()) await toggle.click()
        await expect
          .poll(() =>
            page
              .locator('[data-global-navigation-rail="desktop"]')
              .evaluate(el => el.getBoundingClientRect().width),
          )
          .toBe(expanded ? 264 : 72)
        for (const theme of ['light', 'dark']) {
          const themeToggle = page.getByRole('button', {
            name: locale === 'sv' ? /^Växla tema/ : /^Toggle theme/,
          })
          for (let attempts = 0; attempts < 3; attempts++) {
            if (
              (await themeToggle.getAttribute('data-developer-mode-value')) ===
              theme
            )
              break
            await themeToggle.click()
          }
          await expect(themeToggle).toHaveAttribute(
            'data-developer-mode-value',
            theme,
          )
          const geometry = await row.evaluate(element => {
            const cells = Array.from(element.querySelectorAll('td'))
            const name = cells[0].querySelector('span')
            if (!name) throw new Error('Norm name missing')
            const range = document.createRange()
            range.selectNodeContents(name)
            const lines = new Set(
              Array.from(range.getClientRects()).map(rect => rect.y),
            ).size
            const issuer = cells[0].querySelector('p')
            const badge = element.querySelector('[role="status"]')
            const rect = (el: Element | null) => {
              if (!el) throw new Error('Norm metadata missing')
              const box = el.getBoundingClientRect()
              return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              }
            }
            return {
              columns: cells.map(cell => cell.getBoundingClientRect().width),
              nameLines: lines,
              row: rect(element),
              issuer: rect(issuer),
              name: rect(name),
              identifier: rect(cells[1].querySelector('dd')),
              badge: rect(badge),
              link: rect(element.querySelector('a')),
              buttons: Array.from(element.querySelectorAll('button')).map(rect),
            }
          })
          expect(geometry.columns[0]).toBeGreaterThan(300)
          expect(geometry.columns[2]).toBeCloseTo(
            locale === 'sv' ? 320 : 390,
            0,
          )
          expect(geometry.nameLines).toBeLessThan(10)
          expect(geometry.row.height).toBeLessThan(225)
          expect(
            Math.abs(
              geometry.issuer.y +
                geometry.issuer.height / 2 -
                geometry.row.y -
                geometry.row.height / 2,
            ),
          ).toBeLessThanOrEqual(1)
          expect(
            Math.abs(geometry.name.y - geometry.identifier.y),
          ).toBeLessThanOrEqual(5)
          expect(geometry.link.width).toBe(24)
          expect(geometry.link.height).toBe(24)
          for (const button of geometry.buttons) {
            expect(button.width).toBe(44)
            expect(button.height).toBe(44)
            expect(
              Math.abs(
                button.y + 22 - geometry.badge.y - geometry.badge.height / 2,
              ),
            ).toBeLessThanOrEqual(1)
          }
          for (const [index, count] of [0, 1, 14, 209].entries()) {
            const statusRow = table.getByRole('row').nth(index + 1)
            const countText = `${count} ${locale === 'sv' ? 'krav' : count === 1 ? 'requirement' : 'requirements'}`
            await expect(
              statusRow.getByText(countText, { exact: true }),
            ).toHaveCount(1)
            const spacing = await statusRow.evaluate(el => {
              const badge = el.querySelector('[role="status"]')
              const count = badge?.nextElementSibling
              const action = el.querySelector('button')
              if (!badge || !count || !action)
                throw new Error('Norm status and actions missing')
              const badgeBox = badge.getBoundingClientRect()
              const countBox = count.getBoundingClientRect()
              const actionBox = action.getBoundingClientRect()
              return {
                gap: countBox.x - badgeBox.right,
                height: countBox.height,
                remaining: actionBox.x - countBox.right,
              }
            })
            expect(spacing.gap).toBe(8)
            expect(spacing.height).toBe(16)
            expect(spacing.remaining).toBeGreaterThanOrEqual(8)
          }
          const create = page.locator('[data-floating-action-id="create"]')
          const createBox = await create.boundingBox()
          const tableBox = await table.boundingBox()
          if (!createBox || !tableBox)
            throw new Error('Create button or table missing')
          expect(createBox.x).toBeGreaterThan(tableBox.x + tableBox.width)
          measurements.push({ width, expanded, theme, ...geometry })
          await testInfo.attach(`${locale}-${width}-${expanded}-${theme}`, {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
          })
        }
      }
    }
    const narrow = measurements.find(
      result =>
        result.width === 1440 && !result.expanded && result.theme === 'light',
    )
    const wide = measurements.find(
      result =>
        result.width === 1920 && !result.expanded && result.theme === 'light',
    )
    if (!narrow || !wide) throw new Error('Desktop measurements missing')
    expect(wide.columns[0]).toBeGreaterThan(narrow.columns[0])
    await testInfo.attach('norm-layout-measurements', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    })

    await test.step('reach the URI and actions by keyboard', async () => {
      const filter = page.locator('#norm-reference-filter')
      await filter.focus()
      await page.keyboard.press('Tab')
      const link = row.getByRole('link')
      await expect(link).toBeFocused()
      expect(
        await link.evaluate(el => getComputedStyle(el).boxShadow),
      ).not.toBe('none')
      await expect(link).toHaveAttribute('target', '_blank')
      await page.keyboard.press('Tab')
      await expect(row.getByRole('button').nth(0)).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(row.getByRole('button').nth(1)).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(row.getByRole('button').nth(2)).toBeFocused()
      await filter.fill('no matching norm')
      await expect(table.getByRole('cell')).toHaveText([
        locale === 'sv' ? 'Inga resultat hittades' : 'No results found',
      ])
      await filter.clear()
      await expect(table.getByRole('row')).toHaveCount(5)
    })
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width)
      const overflow = await table.evaluate(el => {
        const surface = el.parentElement
        if (!surface) throw new Error('Table scroll surface missing')
        surface.scrollLeft = surface.scrollWidth
        return {
          width: el.getBoundingClientRect().width,
          scrolled: surface.scrollLeft,
        }
      })
      expect(overflow.width).toBe(1000)
      expect(overflow.scrolled).toBeGreaterThan(0)
      await row.getByRole('button').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page
        .getByRole('dialog')
        .locator('#norm-reference-name')
        .press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
}

test('ADMIN-06B: create, edit, archive, reactivate and delete the selected norm', async ({
  page,
}) => {
  const normId = `PWT-NORM-${Date.now()}`
  let createdId: number | undefined
  try {
    await test.step('create a temporary norm', async () => {
      await page.goto('/sv/requirements/stewardship?tab=norms')
      await page.getByRole('button', { name: 'Ny normreferens' }).click()
      const dialog = page.getByRole('dialog', { name: 'Ny normreferens' })
      await dialog.locator('#norm-reference-id').fill(normId)
      await dialog.locator('#norm-reference-name').fill('PWT norm layout')
      await dialog.locator('#norm-reference-reference').fill('PWT reference')
      await dialog.locator('#norm-reference-type').fill('Standard')
      await dialog.locator('#norm-reference-issuer').fill('PWT issuer')
      const createdResponse = page.waitForResponse(
        response =>
          response.url().endsWith('/api/norm-references') &&
          response.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click()
      createdId = (await (await createdResponse).json()).id
      await expect(dialog).toHaveCount(0)
    })
    await page.locator('#norm-reference-filter').fill(normId)
    const row = page.getByRole('row').filter({ hasText: normId })
    await expect(row.getByRole('status')).toHaveText('Aktiv')
    await test.step('edit the selected norm', async () => {
      await row.getByRole('button', { name: 'Redigera', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Redigera normreferens' })
      await dialog.locator('#norm-reference-name').fill('PWT changed norm')
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(row).toContainText('PWT changed norm')
    })
    await test.step('cancel and confirm archiving', async () => {
      await row.getByRole('button', { name: 'Arkivera', exact: true }).focus()
      await page.keyboard.press('Enter')
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click()
      await expect(row.getByRole('status')).toHaveText('Aktiv')
      await row.getByRole('button', { name: 'Arkivera', exact: true }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(row.getByRole('status')).toHaveText('Arkiverad')
    })
    await test.step('reactivate with the keyboard', async () => {
      await row
        .getByRole('button', { name: 'Återaktivera', exact: true })
        .focus()
      await page.keyboard.press('Enter')
      await expect(row.getByRole('status')).toHaveText('Aktiv')
    })
    await test.step('delete with confirmation', async () => {
      await row.getByRole('button', { name: 'Ta bort', exact: true }).click()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(row).toHaveCount(0)
      createdId = undefined
    })
  } finally {
    if (createdId !== undefined) {
      const response = await page.request.delete(
        `/api/norm-references/${createdId}`,
      )
      expect(response.ok()).toBe(true)
    }
  }
})
