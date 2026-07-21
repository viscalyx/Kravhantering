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
