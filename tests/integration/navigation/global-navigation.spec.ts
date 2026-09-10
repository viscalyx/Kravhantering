import { expect, test } from '@playwright/test'

test.describe('Global navigation', () => {
  test('NAV-01: global side navigation and mobile drawer open and close', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    const desktopRail = page.locator('[data-global-navigation-rail="desktop"]')

    await test.step('verify the desktop rail collapsed state', async () => {
      await expect(desktopRail).toBeVisible()
      const expandButton = desktopRail.getByRole('button', {
        name: 'Expandera navigation',
      })
      await expect(expandButton).toBeVisible()
    })

    await test.step('expand and collapse the desktop navigation', async () => {
      await desktopRail
        .getByRole('button', { name: 'Expandera navigation' })
        .click()
      const collapseButton = desktopRail.getByRole('button', {
        name: 'Fäll ihop navigation',
      })
      await expect(collapseButton).toBeVisible()
      await expect(
        desktopRail.getByText('Kravbiblioteksförvaltning'),
      ).toBeVisible()
      await collapseButton.click()
      await expect(
        desktopRail.getByRole('button', { name: 'Expandera navigation' }),
      ).toBeVisible()
    })

    await test.step('verify the mobile drawer opens and closes', async () => {
      await page.setViewportSize({ height: 812, width: 375 })
      const openButton = page.getByRole('button', { name: 'Öppna meny' })
      await openButton.click()
      const drawer = page.getByRole('dialog', { name: 'Huvudmeny' })
      await expect(drawer).toBeVisible()
      const closeButton = drawer.getByRole('button', { name: 'Stäng meny' })
      await expect(closeButton).toBeVisible()
      await closeButton.click()
      await expect(drawer).toBeHidden()
    })
  })
})

test('NAV-01: list workspace grows with the viewport and keeps actions beside the table', async ({
  page,
}) => {
  await page.goto('/sv/requirements')
  const table = page.locator('[data-requirements-scroll-container]')
  const rail = page.locator('[data-floating-action-rail="true"]')
  const description = page
    .locator('thead th[data-developer-mode-value="requirement text"]')
    .first()
  const widths: number[] = []
  await test.step('resize the workspace and toggle navigation', async () => {
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
      for (const expanded of [false, true]) {
        const toggle = page.getByRole('button', {
          name: expanded ? 'Expandera navigation' : 'Fäll ihop navigation',
          exact: true,
        })
        if (await toggle.count()) await toggle.click()
        await expect
          .poll(async () => {
            const bounds = await table.boundingBox()
            const actions = await rail.boundingBox()
            const navigation = await page
              .locator('[data-global-navigation-rail="desktop"]')
              .boundingBox()
            if (!bounds || !actions || !navigation) return false
            return (
              Math.abs(navigation.width - (expanded ? 264 : 72)) <= 1 &&
              Math.abs(bounds.x - (navigation.width + 33)) <= 1 &&
              bounds.width >= width - navigation.width - 122 &&
              actions.x >= bounds.x + bounds.width + 8 &&
              actions.x + actions.width <= width - 16
            )
          })
          .toBe(true)
        if (!expanded)
          widths.push(
            await description.evaluate(el => el.getBoundingClientRect().width),
          )
      }
    }
  })
  expect(widths[1] - widths[0]).toBeGreaterThan(400)
  await test.step('use list actions after scrolling', async () => {
    await page.mouse.wheel(0, 500)
    await expect
      .poll(async () => {
        const bounds = await table.boundingBox()
        const actions = await rail.boundingBox()
        return !!bounds && !!actions && actions.x >= bounds.x + bounds.width + 8
      })
      .toBe(true)
    await page.locator('[data-column-picker-trigger="true"]').click()
    await expect(
      page.locator('[data-column-picker-popover="true"]'),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

for (const path of [
  '/sv/specifications',
  '/sv/requirements/stewardship?tab=packages',
  '/sv/requirements/stewardship?tab=norms',
  '/sv/requirements/stewardship?tab=questions',
  '/sv/requirements/stewardship?tab=information-requests',
  '/sv/requirement-areas',
  '/sv/requirement-types',
  '/sv/priority-levels',
  '/sv/quality-characteristics',
  '/sv/requirement-categories',
  '/sv/specification-item-statuses',
  '/sv/admin',
  '/sv/admin?tab=settings',
  '/sv/admin?tab=identity',
  '/sv/admin?tab=taxonomy',
  '/sv/admin?tab=actionAuditLog',
]) {
  test(`NAV-01: ${path} uses the workspace beside navigation`, async ({
    page,
  }) => {
    await page.goto(path)
    const workspace = page
      .locator('[data-developer-mode-name="list workspace"]')
      .first()
    await expect(workspace).toContainText(/\S/)
    await test.step('keep the list accessible beside both navigation states', async () => {
      for (const width of [1440, 1920]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 1080,
        })
        for (const expanded of [false, true]) {
          const toggle = page.getByRole('button', {
            name: expanded ? 'Expandera navigation' : 'Fäll ihop navigation',
            exact: true,
          })
          if (await toggle.count()) await toggle.click()
          await expect
            .poll(async () => {
              const bounds = await workspace.boundingBox()
              const nav = await page
                .locator('[data-global-navigation-rail="desktop"]')
                .boundingBox()
              if (!bounds || !nav) return false
              return (
                Math.abs(nav.width - (expanded ? 264 : 72)) <= 1 &&
                Math.abs(bounds.x - nav.width - 32) <= 1 &&
                bounds.width >= width - nav.width - 120
              )
            })
            .toBe(true)
          const rail = page.locator('[data-floating-action-rail="true"]')
          if (await rail.count()) {
            await expect
              .poll(async () => {
                const bounds = await workspace.boundingBox()
                const actions = await rail.first().boundingBox()
                return (
                  !!bounds &&
                  !!actions &&
                  actions.x >= bounds.x + bounds.width &&
                  actions.x + actions.width <= width - 16
                )
              })
              .toBe(true)
          }
        }
      }
    })
  })
}
