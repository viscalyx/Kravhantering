import { expect, test } from '@playwright/test'

test.describe('Global navigation', () => {
  test('NAV-01: global side navigation keeps desktop and mobile tool actions aligned', async ({
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
      await expect(expandButton.locator('svg')).toHaveClass(
        /lucide-panel-left-open/,
      )
    })

    await test.step('expand and collapse affordances stay aligned', async () => {
      await desktopRail
        .getByRole('button', { name: 'Expandera navigation' })
        .click()
      const collapseButton = desktopRail.getByRole('button', {
        name: 'Fäll ihop navigation',
      })
      await expect(collapseButton).toBeVisible()
      await expect(collapseButton.locator('svg')).toHaveClass(
        /lucide-panel-left-close/,
      )
      await expect(
        desktopRail.getByText('Kravbiblioteksförvaltning'),
      ).toBeVisible()
      await expect(desktopRail).toHaveCSS('width', '264px')
    })

    await test.step('verify desktop utility button alignment', async () => {
      const utilityButtons = [
        desktopRail.getByRole('button', { name: 'Byt språk' }),
        desktopRail.getByRole('button', { name: /^Växla tema/ }),
        desktopRail.getByRole('button', { name: /^Inloggad som / }),
      ]
      const boxes = []
      for (const button of utilityButtons) {
        await expect(button).toBeVisible()
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        if (box) boxes.push(box)
      }
      expect(new Set(boxes.map(box => Math.round(box.width))).size).toBe(1)
    })

    await test.step('verify the mobile drawer opens and closes', async () => {
      await page.setViewportSize({ height: 812, width: 375 })
      const openButton = page.getByRole('button', { name: 'Öppna meny' })
      await expect(openButton.locator('svg')).toHaveClass(
        /lucide-panel-left-open/,
      )
      await openButton.click()
      const drawer = page.getByRole('dialog', { name: 'Huvudmeny' })
      await expect(drawer).toBeVisible()
      const closeButton = drawer.getByRole('button', { name: 'Stäng meny' })
      await expect(closeButton).toBeVisible()
      await expect(closeButton.locator('svg')).toHaveClass(
        /lucide-panel-left-close/,
      )
      await closeButton.click()
      await expect(drawer).toBeHidden()
    })
  })
})
