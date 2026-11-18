import { expect, test } from '@playwright/test'
import { expectApiResponseOk } from '@/tests/support/api-response-assertions'
import { DESKTOP_VIEWPORT } from '../../helpers/desktop-viewport'

test('ADMIN-34: required catalog SQL failures keep safe references and form edits', async ({
  page,
}) => {
  let fail = true
  let attempts = 0
  let saveAttempts = 0
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/requirements'
    )
      saveAttempts++
  })
  await page.route('**/api/requirement-types', route => {
    attempts++
    return fail
      ? route.fulfill({
          status: 500,
          json: {
            code: 'sql_failure',
            correlationId: 'catalog-browser-reference',
            timestamp: '2026-11-17T12:00:00.000Z',
          },
        })
      : route.continue()
  })
  await page.goto('/sv/requirements/new')
  await page.locator('#description').fill('Keep these reviewed edits')
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'catalog-browser-reference' })
  await expect(error).toContainText('sql_failure')
  await expect(error).toContainText('2026-11-17T12:00:00.000Z')
  await expect(page.locator('button[type="submit"]')).toBeDisabled()
  // Development Strict Mode may restart the initial GET; measure the explicit retry from the settled failure state.
  const initialAttempts = attempts
  expect(initialAttempts).toBeGreaterThan(0)
  expect(saveAttempts).toBe(0)
  fail = false
  await error.getByRole('button', { name: 'Försök igen', exact: true }).click()
  await expect(error).toHaveCount(0)
  await expect(page.locator('#description')).toHaveValue(
    'Keep these reviewed edits',
  )
  expect(attempts).toBe(initialAttempts + 1)
  expect(saveAttempts).toBe(0)
})

test.describe('Requirement creation', () => {
  for (const departure of ['link', 'language', 'Back', 'Cancel'] as const) {
    test(`LIFE-01D: new requirement preserves input on declined ${departure} and leaves on confirmation`, async ({
      page,
    }) => {
      const picker = page.getByRole('dialog', {
        name: 'Välj kravpaket',
        exact: true,
      })
      const { area, packageName } =
        await test.step('prepare the form', async () => {
          await page.goto('/sv/requirements')
          await page
            .getByRole('link', { name: 'Nytt krav', exact: true })
            .click()
          await page.locator('#description').fill('Min osparade kravtext')
          await page
            .locator('#acceptanceCriteria')
            .fill('Mitt acceptanskriterium')
          await page.locator('#areaId').selectOption({ index: 1 })
          const area = await page.locator('#areaId').inputValue()
          await page
            .getByRole('checkbox', { name: 'Verifierbar', exact: true })
            .check()
          await page
            .locator('#verificationMethod')
            .fill('Kontrollera resultatet')
          await page
            .getByRole('button', { name: 'Välj kravpaket', exact: true })
            .click()
          const option = picker.getByRole('checkbox').first()
          const packageName = await option.getAttribute('aria-label')
          if (!packageName) throw new Error('The package option needs a name')
          await option.check()
          await picker
            .getByRole('button', { name: 'Välj', exact: true })
            .click()
          await expect(picker).toBeHidden()

          return { area, packageName }
        })

      const leave = async () => {
        if (departure === 'Back')
          await page.evaluate(() => window.history.back())
        else if (departure === 'Cancel')
          await page
            .getByRole('button', { name: 'Avbryt', exact: true })
            .click()
        else if (departure === 'language')
          await page.getByRole('button', { name: 'Byt språk' }).click()
        else
          await page
            .getByRole('navigation', { name: 'Huvudnavigation' })
            .getByRole('link', { name: 'Kravunderlag', exact: true })
            .click()
      }

      const confirmation = page.getByRole('alertdialog')
      await test.step('decline departure', async () => {
        await leave()
        await expect(confirmation).toContainText('Du har osparade ändringar')
        await confirmation
          .getByRole('button', { name: 'Avbryt', exact: true })
          .click()
        await expect(confirmation).toBeHidden()
      })
      await test.step('check retained values', async () => {
        await expect(page).toHaveURL(/\/sv\/requirements\/new$/)
        await expect(page.locator('#description')).toHaveValue(
          'Min osparade kravtext',
        )
        await expect(page.locator('#acceptanceCriteria')).toHaveValue(
          'Mitt acceptanskriterium',
        )
        await expect(page.locator('#areaId')).toHaveValue(area)
        await expect(
          page.getByRole('checkbox', { name: 'Verifierbar', exact: true }),
        ).toBeChecked()
        await expect(page.locator('#verificationMethod')).toHaveValue(
          'Kontrollera resultatet',
        )
        await page
          .getByRole('button', { name: 'Välj kravpaket', exact: true })
          .click()
        await expect(
          picker.getByRole('checkbox', { name: packageName, exact: true }),
        ).toBeChecked()
        await picker
          .getByRole('button', { name: 'Avbryt', exact: true })
          .click()
        await expect(picker).toBeHidden()
      })

      await test.step('confirm departure', async () => {
        await leave()
        await confirmation
          .getByRole('button', { name: 'Bekräfta', exact: true })
          .click()
        const destination =
          departure === 'link'
            ? /\/sv\/specifications$/
            : departure === 'language'
              ? /\/en\/requirements\/new$/
              : /\/sv\/requirements$/
        await expect(page).toHaveURL(destination)
        await expect(confirmation).toBeHidden()
        if (departure === 'language') {
          await page.locator('#description').fill('Unsaved requirement text')
          await page.getByRole('button', { name: 'Switch language' }).click()
          await expect(confirmation).toContainText('You have unsaved changes')
          await confirmation
            .getByRole('button', { name: 'Confirm', exact: true })
            .click()
          await expect(page).toHaveURL(/\/sv\/requirements\/new$/)
        }
      })
    })
  }

  test('LIFE-01E: clean and restored new forms leave without confirmation', async ({
    page,
  }) => {
    for (const restore of [false, true]) {
      await test.step('prepare a clean or restored form', async () => {
        await page.goto('/sv/requirements')
        await page.getByRole('link', { name: 'Nytt krav', exact: true }).click()
        if (restore) {
          await page
            .locator('#acceptanceCriteria')
            .fill('Tillfälligt kriterium')
          await page.locator('#acceptanceCriteria').fill('   ')
        }
        await expect(
          page.getByRole('button', { name: 'Spara', exact: true }),
        ).toBeDisabled()
      })
      await test.step('leave without confirmation', async () => {
        await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
        await expect(page).toHaveURL(/\/sv\/requirements$/)
        await expect(page.getByRole('alertdialog')).toBeHidden()
      })
    }
  })

  test('LIFE-01F: reload and tab close protect a new requirement until departure is accepted', async ({
    page,
  }) => {
    await test.step('prepare unsaved input', async () => {
      await page.goto('/sv/requirements/new')
      await page.locator('#acceptanceCriteria').fill('Mitt acceptanskriterium')
    })
    await test.step('decline reload and retain input', async () => {
      const pendingDialog = page.waitForEvent('dialog')
      const reload = page.reload().catch(() => null)
      const dialog = await pendingDialog
      expect(dialog.type()).toBe('beforeunload')
      await dialog.dismiss()
      await reload
      await expect(page.locator('#acceptanceCriteria')).toHaveValue(
        'Mitt acceptanskriterium',
      )
    })
    await test.step('confirm reload', async () => {
      const acceptedDialog = page.waitForEvent('dialog')
      const acceptedReload = page.reload()
      await (await acceptedDialog).accept()
      await acceptedReload
      await expect(page.locator('#acceptanceCriteria')).toHaveValue('')
    })
    await test.step('decline tab close and retain input', async () => {
      await page.locator('#description').fill('Kravtext innan fliken stängs')
      const closeDialog = page.waitForEvent('dialog')
      await page.close({ runBeforeUnload: true })
      const closeConfirmation = await closeDialog
      expect(closeConfirmation.type()).toBe('beforeunload')
      await closeConfirmation.dismiss()
      await expect(page.locator('#description')).toHaveValue(
        'Kravtext innan fliken stängs',
      )
    })
    await test.step('confirm tab close', async () => {
      const finalDialog = page.waitForEvent('dialog')
      const closed = page.waitForEvent('close')
      await page.close({ runBeforeUnload: true })
      await (await finalDialog).accept()
      await closed
    })
  })

  test('LIFE-01G: validation and failed creation preserve input and protection until successful save', async ({
    page,
  }) => {
    const confirmation = page.getByRole('alertdialog')
    await test.step('retain input after validation fails', async () => {
      await page.goto('/sv/requirements/new')
      await page.locator('#description').fill('Kravtext som ska bevaras')
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(page.locator('#areaId')).toBeFocused()
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await confirmation
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
    })
    await test.step('retain input and protection after saving fails', async () => {
      await page.locator('#areaId').selectOption({ index: 1 })
      await page.route('**/api/requirements', route =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 500, json: { error: 'Save unavailable' } })
          : route.continue(),
      )
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(
        page.getByRole('alert').filter({ hasText: 'Save unavailable' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Byt språk' }).click()
      await confirmation
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
      await expect(page.locator('#description')).toHaveValue(
        'Kravtext som ska bevaras',
      )
    })
    await test.step('save successfully without a discard prompt', async () => {
      await page.unroute('**/api/requirements')
      await page.getByRole('button', { name: 'Spara', exact: true }).click()
      await expect(page).toHaveURL(url => url.pathname === '/sv/requirements')
      await expect(confirmation).toBeHidden()
      await expect(
        page.locator('[data-expanded-detail-cell="true"]').first(),
      ).toContainText('Kravtext som ska bevaras')
    })
  })

  test('LIFE-01H: a new form at the first history entry keeps input and protection after Cancel', async ({
    page,
    context,
  }) => {
    const confirmation = page.getByRole('alertdialog')
    await test.step('prepare the first history entry', async () => {
      await page.goto('/sv/requirements/new')
      const session = await context.newCDPSession(page)
      await session.send('Page.resetNavigationHistory')
      await session.detach()
      await page
        .getByRole('checkbox', { name: 'Verifierbar', exact: true })
        .check()
    })
    await test.step('confirm Cancel without a back destination', async () => {
      await page.evaluate(() => window.history.back())
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await confirmation
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
      await expect(page).toHaveURL(/\/sv\/requirements\/new$/)
      await expect(
        page.getByRole('checkbox', { name: 'Verifierbar', exact: true }),
      ).toBeChecked()
      expect(await page.evaluate(() => window.history.length)).toBe(1)
    })
    await test.step('check later departure remains guarded', async () => {
      await page.evaluate(() => {
        window.location.hash = 'description'
      })
      await expect(page).toHaveURL(/#description$/)
      await page.goBack()
      await expect(page).toHaveURL(/\/sv\/requirements\/new$/)
      expect(await page.evaluate(() => window.navigation.canGoBack)).toBe(false)
      expect(await page.evaluate(() => window.navigation.canGoForward)).toBe(
        true,
      )
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await confirmation
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
      await page.getByRole('button', { name: 'Byt språk' }).click()
      await expect(confirmation).toBeVisible()
    })
  })

  test('LIFE-01I: confirmed Cancel returns to a cross-origin predecessor', async ({
    page,
    baseURL,
  }) => {
    const previousUrl = 'https://previous.example.test/'
    const unexpectedDialogs: string[] = []
    page.on('dialog', async dialog => {
      unexpectedDialogs.push(dialog.type())
      await dialog.dismiss()
    })
    await test.step('open the form from another origin and enter text', async () => {
      await page.route(previousUrl, route =>
        route.fulfill({
          contentType: 'text/html',
          body: `<a href="${new URL('/sv/requirements/new', baseURL)}">Open requirement form</a>`,
        }),
      )
      await page.goto(previousUrl)
      await page.getByRole('link', { name: 'Open requirement form' }).click()
      await expect(page.locator('#areaId')).toBeEnabled()
      await page
        .locator('#description')
        .fill('Kravtext från en annan webbplats')
      await expect(
        page.getByRole('button', { name: 'Spara', exact: true }),
      ).toBeEnabled()
      expect(await page.evaluate(() => window.navigation.canGoBack)).toBe(false)
      expect(await page.evaluate(() => window.history.length)).toBeGreaterThan(
        1,
      )
    })
    const confirmation = page.getByRole('alertdialog')
    await test.step('decline Cancel and retain the input', async () => {
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await confirmation
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
      await expect(page.locator('#description')).toHaveValue(
        'Kravtext från en annan webbplats',
      )
    })
    await test.step('confirm Cancel and return without a second prompt', async () => {
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await confirmation
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(page).toHaveURL(previousUrl)
      await expect(
        page.getByRole('link', { name: 'Open requirement form' }),
      ).toBeVisible()
      expect(unexpectedDialogs).toEqual([])
    })
  })

  test('LIFE-01J: fragment-only Cancel keeps later navigation and reload guarded', async ({
    page,
  }) => {
    const confirmation = page.getByRole('alertdialog')
    await test.step('prepare unsaved input and a fragment history entry', async () => {
      await page.goto('/sv/requirements/new#description')
      await page.locator('#description').fill('Kravtext som ska skyddas')
      await page.evaluate(() => {
        window.location.hash = 'acceptanceCriteria'
      })
      await expect(page).toHaveURL(/#acceptanceCriteria$/)
    })
    await test.step('confirm Cancel to the earlier fragment', async () => {
      await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
      await confirmation
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
      await expect(page).toHaveURL(/\/requirements\/new#description$/)
      await expect(page.locator('#description')).toHaveValue(
        'Kravtext som ska skyddas',
      )
    })
    const leave = () =>
      page
        .getByRole('navigation', { name: 'Huvudnavigation' })
        .getByRole('link', { name: 'Kravunderlag', exact: true })
        .click()
    await test.step('decline later navigation and retain the input', async () => {
      await leave()
      await confirmation
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click()
      await expect(confirmation).toBeHidden()
      await expect(page.locator('#description')).toHaveValue(
        'Kravtext som ska skyddas',
      )
    })
    await test.step('decline reload and retain the input', async () => {
      const pendingDialog = page.waitForEvent('dialog')
      const reload = page.reload().catch(() => null)
      const dialog = await pendingDialog
      expect(dialog.type()).toBe('beforeunload')
      await dialog.dismiss()
      await reload
      await expect(page.locator('#description')).toHaveValue(
        'Kravtext som ska skyddas',
      )
    })
    await test.step('confirm later departure', async () => {
      await leave()
      await confirmation
        .getByRole('button', { name: 'Bekräfta', exact: true })
        .click()
      await expect(page).toHaveURL(/\/sv\/specifications$/)
    })
  })

  for (const viewport of [{ ...DESKTOP_VIEWPORT, label: 'desktop' }]) {
    test(`LIFE-01: form submit opens the saved requirement and records its action history (${viewport.label})`, async ({
      page,
      request,
    }) => {
      let created: { id: number; uniqueId: string }
      await test.step('prepare form data', async () => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        })

        // Get a valid requirement area for selection
        const areasRes = await request.get('/api/requirement-areas')
        await expectApiResponseOk(areasRes, 'GET requirement areas')
        const areasData = (await areasRes.json()) as {
          areas: { id: number; name: string }[]
        }
        expect(areasData.areas.length).toBeGreaterThan(0)
        const area = areasData.areas[0]

        await page.goto('/sv/requirements/new')

        // Select requirement area
        await page.selectOption('#areaId', String(area.id))

        // Fill description
        await page.fill('#description', 'Playwright UI test requirement')
      })

      await test.step('submit and return to the selected row', async () => {
        // Submit the form
        const responsePromise = page.waitForResponse(
          response =>
            new URL(response.url()).pathname === '/api/requirements' &&
            response.request().method() === 'POST',
        )
        await page.click('button[type="submit"]')
        const response = await responsePromise
        await expectApiResponseOk(response, 'Create requirement')
        created = (await response.json()).requirement

        // Should redirect to the list (not /requirements/undefined)
        await expect(page).toHaveURL(/\/sv\/requirements(?:\?|$)/)
        expect(page.url()).not.toContain('undefined')

        // The inline detail panel should contain the requirement description.
        await expect(
          page.locator('[data-expanded-detail-cell="true"]').first(),
        ).toContainText('Playwright UI test requirement')
      })

      await test.step('find the saved requirement in the action log', async () => {
        await page.goto(
          `/sv/admin/audit-log?action=requirement.create&target_kind=Requirement&target_id=${created.id}`,
        )
        const rows = page.getByRole('row').filter({
          has: page.getByRole('cell', {
            name: 'requirement.create',
            exact: true,
          }),
        })
        await expect(rows).toHaveCount(1)
        await expect(rows).toContainText(created.uniqueId)
        await expect(rows).toContainText('Tillåten')
      })
    })
  }
})
