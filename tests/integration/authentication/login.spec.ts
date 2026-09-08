import { expect, type Page, type TestInfo, test } from '@playwright/test'

/**
 * Dedicated end-to-end coverage of the real Keycloak login redirect chain.
 * Runs without the shared storageState fixture so we always start signed out
 * and exercise `/api/auth/login` -> Keycloak -> `/api/auth/callback`.
 */
test.use({ storageState: { cookies: [], origins: [] } })

function sessionCookieName(testInfo: TestInfo): string {
  const configured =
    process.env.AUTH_SESSION_COOKIE_NAME?.trim() || 'kravhantering_session'
  return testInfo.config.metadata.secureCookies &&
    !configured.startsWith('__Host-')
    ? `__Host-${configured}`
    : configured
}

async function submitLogin(page: Page): Promise<void> {
  await page.locator('#username').fill('ada.admin')
  await page.locator('#password').fill('devpass')
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/realms/')),
    page.locator('#kc-login').click(),
  ])
}

test.describe('login flow', () => {
  test('AUTH-01/AUTH-02: signs in with the effective cookies and clears the session on logout', async ({
    page,
    request,
  }, testInfo) => {
    const cookieName = sessionCookieName(testInfo)
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    await test.step('Sign in and consume the effective login-state cookie', async () => {
      const meBefore = (await (await request.get('/api/auth/me')).json()) as {
        authenticated: boolean
      }
      expect(meBefore.authenticated).toBe(false)

      await page.goto('/sv/requirements')
      await page.waitForURL(
        /\/realms\/kravhantering-dev\/protocol\/openid-connect/,
      )

      const loginCookies = await page.context().cookies(appOrigin)
      expect(
        loginCookies.find(cookie => cookie.name === `${cookieName}_login`),
      ).toMatchObject({
        httpOnly: true,
        secure: Boolean(testInfo.config.metadata.secureCookies),
        sameSite: 'Lax',
        path: '/',
      })
      await submitLogin(page)
      const signedInCookies = await page.context().cookies(appOrigin)
      expect(
        signedInCookies.find(cookie => cookie.name === cookieName),
      ).toMatchObject({
        httpOnly: true,
        secure: Boolean(testInfo.config.metadata.secureCookies),
        sameSite: 'Lax',
        path: '/',
        domain: new URL(appOrigin).hostname,
      })
      expect(
        signedInCookies.some(cookie => cookie.name === `${cookieName}_login`),
      ).toBe(false)

      const meAfter = (await (
        await page.request.get('/api/auth/me')
      ).json()) as {
        authenticated: boolean
        name?: string
      }
      expect(meAfter.authenticated).toBe(true)
      expect(meAfter.name).toBeTruthy()

      await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
      await expect(
        page.getByRole('table', { name: 'Lista över krav' }),
      ).toHaveCount(1)
      const userMenuButton = page.getByRole('button', {
        name: /^Inloggad som /,
      })
      await userMenuButton.hover()
      await expect(
        page.getByRole('dialog', { name: 'Kontouppgifter' }),
      ).toContainText('Admin')
    })
    await test.step('Log out and require authentication again', async () => {
      await page
        .getByRole('dialog', { name: 'Kontouppgifter' })
        .getByRole('button', { name: 'Logga ut' })
        .click()
      await expect(page).toHaveURL(
        /\/realms\/kravhantering-dev\/protocol\/openid-connect/,
      )
      expect(
        (await page.context().cookies(appOrigin)).some(
          cookie => cookie.name === cookieName,
        ),
      ).toBe(false)
      expect(await (await page.request.get('/api/auth/me')).json()).toEqual({
        authenticated: false,
      })
    })
  })

  test('AUTH-01/AUTH-09: secure cookie cutover requires fresh login and retries interrupted login', async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.config.metadata.secureCookies,
      'Cookie-name cutover applies to secure builds',
    )
    const appOrigin = new URL(testInfo.project.use.baseURL as string).origin
    const name = sessionCookieName(testInfo)
    const legacyName = name.slice('__Host-'.length)
    const legacyLogin =
      await test.step('Retry an interrupted login using the effective cookie name', async () => {
        await page.goto('/sv/requirements')
        await page.waitForURL(
          /\/realms\/kravhantering-dev\/protocol\/openid-connect/,
        )
        const loginCookie = (await page.context().cookies(appOrigin)).find(
          cookie => cookie.name === `${name}_login`,
        )
        expect(loginCookie).toBeDefined()
        if (!loginCookie) throw new Error('Missing login-state cookie')
        const legacyLogin = { ...loginCookie, name: `${legacyName}_login` }
        await page.context().addCookies([legacyLogin])
        await page.context().clearCookies({ name: `${name}_login` })
        await submitLogin(page)
        await expect(page).toHaveURL(
          /\/auth\/error\?.*code=login_state_cookie_missing/,
        )
        expect(await (await page.request.get('/api/auth/me')).json()).toEqual({
          authenticated: false,
        })
        await page.getByRole('link', { name: 'Försök logga in igen' }).click()
        await expect(page).toHaveURL(/\/sv(?:\/requirements)?(?:\?|$)/)
        return legacyLogin
      })
    await test.step('Require fresh login for a legacy session without refreshing legacy cookies', async () => {
      const session = (await page.context().cookies(appOrigin)).find(
        cookie => cookie.name === name,
      )
      expect(session).toBeDefined()
      if (!session) throw new Error('Missing effective session cookie')
      const legacySession = { ...session, name: legacyName }
      await page.context().addCookies([legacySession])
      await page.context().clearCookies({ name })
      expect(await (await page.request.get('/api/auth/me')).json()).toEqual({
        authenticated: false,
      })
      await page.goto('/sv/requirements')
      await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
      expect(
        (await (await page.request.get('/api/auth/me')).json()).authenticated,
      ).toBe(true)
      const finalCookies = await page.context().cookies(appOrigin)
      expect(finalCookies.find(cookie => cookie.name === legacyName)).toEqual(
        legacySession,
      )
      expect(
        finalCookies.find(cookie => cookie.name === `${legacyName}_login`),
      ).toEqual(legacyLogin)
      expect(finalCookies.find(cookie => cookie.name === name)).toBeDefined()
    })
  })
})
