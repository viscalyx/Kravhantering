import { expect, test } from '@playwright/test'

/**
 * Dedicated end-to-end coverage of the real Keycloak login redirect chain.
 * Runs without the shared storageState fixture so we always start signed out
 * and exercise `/api/auth/login` -> Keycloak -> `/api/auth/callback`.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('login flow', () => {
  test('AUTH-01: signs in via Keycloak and surfaces the user in the auth menu', async ({
    page,
    request,
  }) => {
    const meBefore = (await (await request.get('/api/auth/me')).json()) as {
      authenticated: boolean
    }
    expect(meBefore.authenticated).toBe(false)

    await page.goto('/sv/requirements')
    await page.waitForURL(
      /\/realms\/kravhantering-dev\/protocol\/openid-connect/,
    )

    await page.locator('#username').fill('ada.admin')
    await page.locator('#password').fill('devpass')
    await Promise.all([
      page.waitForURL(url => !url.pathname.startsWith('/realms/')),
      page.locator('#kc-login').click(),
    ])

    const meAfter = (await (await page.request.get('/api/auth/me')).json()) as {
      authenticated: boolean
      name?: string
    }
    expect(meAfter.authenticated).toBe(true)
    expect(meAfter.name).toBeTruthy()

    await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
    await expect(
      page.getByRole('table', { name: 'Lista över krav' }),
    ).toBeVisible()
    const userMenuButton = page.getByRole('button', {
      name: /^Inloggad som /,
    })
    await userMenuButton.hover()
    await expect(
      page.getByRole('dialog', { name: 'Kontouppgifter' }),
    ).toContainText('Admin')
  })
})
