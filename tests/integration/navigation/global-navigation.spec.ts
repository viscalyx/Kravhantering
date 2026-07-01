import { expect, test } from '@playwright/test'

test.describe('Global navigation', () => {
  test('NAV-01: global side navigation keeps desktop and mobile tool actions aligned', async ({
    page,
  }) => {
    await page.goto('/sv/requirements')

    const desktopRail = page.locator('[data-global-navigation-rail="desktop"]')
    await expect(desktopRail).toBeVisible()
    await expect(
      desktopRail.getByRole('button', { name: 'Expandera navigation' }),
    ).toBeVisible()

    await desktopRail
      .getByRole('button', { name: 'Expandera navigation' })
      .click()
    await expect(
      desktopRail.getByRole('button', { name: 'Fäll ihop navigation' }),
    ).toBeVisible()
    await expect(
      desktopRail.getByText('Kravbiblioteksförvaltning'),
    ).toBeVisible()
    await expect(desktopRail).toHaveCSS('width', '264px')

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

    await page.setViewportSize({ height: 812, width: 375 })
    await page.getByRole('button', { name: 'Öppna meny' }).click()
    const drawer = page.getByRole('dialog', { name: 'Huvudmeny' })
    await expect(drawer).toBeVisible()
    await expect(
      drawer.getByRole('button', { name: 'Stäng meny' }),
    ).toBeVisible()
    await drawer.getByRole('button', { name: 'Stäng meny' }).click()
    await expect(drawer).toBeHidden()
  })
})
