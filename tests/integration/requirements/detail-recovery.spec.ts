import { expect, test } from '@playwright/test'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

test.use({ viewport: DESKTOP_VIEWPORT })

for (const locale of ['sv', 'en'] as const) {
  for (const surface of ['inline', 'standalone'] as const) {
    test(`REQ-22: detail retry preserves selection and keyboard focus (${locale}, ${surface})`, async ({
      page,
    }) => {
      let failure: 'network' | 'server' | null = 'network'
      await page.route(/\/api\/requirements\/[^/?]+$/, async route => {
        if (failure === 'network') await route.abort('failed')
        else if (failure === 'server')
          await route.fulfill({ status: 500, json: {} })
        else await route.continue()
      })
      const path =
        surface === 'inline'
          ? `/${locale}/requirements?selected=INT0001`
          : `/${locale}/requirements/INT0001`
      await test.step('recover the selected detail with the keyboard', async () => {
        await page.goto(path)
        const message =
          locale === 'sv'
            ? 'Kravet kunde inte läsas in. Försök igen.'
            : 'The requirement could not be loaded. Try again.'
        await expect(
          page.getByRole('alert').filter({ hasText: message }),
        ).toHaveCount(1)
        const retry = page.getByRole('button', {
          name: locale === 'sv' ? 'Försök igen' : 'Retry',
          exact: true,
        })
        await expect(retry).toHaveAttribute(
          'data-developer-mode-value',
          'retry detail',
        )
        failure = 'server'
        await retry.focus()
        await retry.press('Enter')
        await expect(retry).toHaveAttribute('aria-disabled', 'false')
        await expect(retry).toBeFocused()
        await expect(
          page.getByRole('alert').filter({ hasText: message }),
        ).toHaveCount(1)
        failure = null
        await retry.press('Enter')
        await expect(
          page.getByRole('button', {
            name: locale === 'sv' ? 'Dela' : 'Share',
            exact: true,
          }),
        ).toBeEnabled()
        await expect(page).toHaveURL(
          new RegExp(
            surface === 'inline' ? '/requirements$' : '/requirements/INT0001',
          ),
        )
        if (surface === 'inline')
          await expect(
            page.getByRole('button', { name: /^INT0001\b/u }),
          ).toHaveAttribute('aria-expanded', 'true')
      })
    })
  }
}

for (const status of [403, 404]) {
  test(`REQ-23: HTTP ${status} shows specific feedback without requirement actions`, async ({
    page,
  }) => {
    await page.route(/\/api\/requirements\/[^/?]+$/, route =>
      route.fulfill({ status, json: {} }),
    )
    await test.step('verify the authoritative detail response', async () => {
      await page.goto('/sv/requirements?selected=INT0001')
      await expect(
        page.getByRole('alert').filter({
          hasText:
            status === 403
              ? 'Du har inte behörighet att läsa detta krav.'
              : 'Kravet kunde inte hittas.',
        }),
      ).toHaveCount(1)
      await expect(
        page.getByRole('button', { name: 'Arkivera', exact: true }),
      ).toHaveCount(0)
    })
  })
}

test('REQ-24: workflow retry restores actions without reselecting the requirement', async ({
  page,
}) => {
  let failure = true
  await page.route('**/api/requirement-statuses', async route => {
    if (failure) await route.fulfill({ status: 500, json: {} })
    else await route.continue()
  })
  await test.step('recover workflow prerequisites', async () => {
    await page.goto('/sv/requirements?selected=INT0002')
    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'Arbetsflödets åtgärder kunde inte läsas in.' })
    await expect(alert).toHaveCount(1)
    const archive = page.getByRole('button', { name: 'Arkivera', exact: true })
    await expect(archive).toBeDisabled()
    failure = false
    const retry = page.getByRole('button', { name: 'Försök igen', exact: true })
    await expect(retry).toHaveAttribute(
      'data-developer-mode-value',
      'retry statuses',
    )
    await retry.click()
    await expect(alert).toHaveCount(0)
    await expect(archive).toBeEnabled()
    await expect(
      page.getByRole('button', { name: /^INT0002\b/u }),
    ).toHaveAttribute('aria-expanded', 'true')
  })
})

test('REQ-25: refresh failure marks a snapshot stale and denial removes it', async ({
  page,
}) => {
  let responseStatus = 200
  await page.route(/\/api\/requirements\/[^/?]+$/, async route => {
    if (route.request().method() === 'DELETE') {
      responseStatus = 500
      await route.fulfill({ status: 200, json: {} })
    } else if (responseStatus !== 200)
      await route.fulfill({ status: responseStatus, json: {} })
    else await route.continue()
  })
  await test.step('retain stale detail and clear denied content', async () => {
    await page.goto('/sv/requirements?selected=INT0002')
    const archive = page.getByRole('button', { name: 'Arkivera', exact: true })
    await expect(archive).toBeEnabled()
    await archive.click()
    await page.getByRole('button', { name: 'Bekräfta', exact: true }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Uppgifterna som visas kan vara inaktuella.' }),
    ).toHaveCount(1)
    await expect(archive).toBeDisabled()
    responseStatus = 403
    await page.getByRole('button', { name: 'Försök igen', exact: true }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Du har inte behörighet att läsa detta krav.' }),
    ).toHaveCount(1)
    await expect(archive).toHaveCount(0)
  })
})
