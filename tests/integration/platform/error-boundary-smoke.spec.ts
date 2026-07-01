import { expect, test } from '@playwright/test'

test.describe('localized App Router error boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-error-boundary-test': '1' })
  })

  test('REQ-12: shows Swedish library recovery for a locale client render failure', async ({
    page,
  }) => {
    await test.step('open the gated client-error route', async () => {
      await page.goto('/sv/error-boundary-test')
    })

    const recovery = page.getByRole('alert', { name: 'Något gick fel' })

    await test.step('show localized recovery copy without raw error details', async () => {
      await expect(recovery).toContainText('Något gick fel')
      await expect(recovery).toContainText(
        'Sidan kunde inte visas. Försök igen',
      )
      await expect(recovery).not.toContainText(
        'Test-only route error boundary trigger',
      )
      await expect(
        recovery.getByRole('button', { name: 'Försök igen' }),
      ).toHaveCount(1)
    })

    await test.step('offer library-first safe navigation', async () => {
      const recoveryLinks = recovery.getByRole('link')
      await expect(recoveryLinks.first()).toHaveText('Gå till kravbiblioteket')
      await expect(recoveryLinks.first()).toHaveAttribute(
        'href',
        '/sv/requirements',
      )
      await expect(recoveryLinks.nth(1)).toHaveText('Gå till administration')
      await expect(recoveryLinks.nth(1)).toHaveAttribute('href', '/sv/admin')
    })
  })

  test('RES-01: shows English admin recovery for an admin client render failure', async ({
    page,
  }) => {
    await test.step('open the gated client-error admin route', async () => {
      await page.goto('/en/admin/error-boundary-test')
    })

    const recovery = page.getByRole('alert', { name: 'Something went wrong' })

    await test.step('show localized recovery copy without raw error details', async () => {
      await expect(recovery).toContainText('Something went wrong')
      await expect(recovery).toContainText(
        'The page could not be rendered. Try again',
      )
      await expect(recovery).not.toContainText(
        'Test-only admin error boundary trigger',
      )
      await expect(
        recovery.getByRole('button', { name: 'Try again' }),
      ).toHaveCount(1)
    })

    await test.step('offer admin-first safe navigation', async () => {
      const recoveryLinks = recovery.getByRole('link')
      await expect(recoveryLinks.first()).toHaveText('Go to admin')
      await expect(recoveryLinks.first()).toHaveAttribute('href', '/en/admin')
      await expect(recoveryLinks.nth(1)).toHaveText(
        'Go to requirements library',
      )
      await expect(recoveryLinks.nth(1)).toHaveAttribute(
        'href',
        '/en/requirements',
      )
    })
  })
})
