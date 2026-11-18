import { expect, test } from '@playwright/test'
import { expectApiResponseOk } from '@/tests/support/api-response-assertions'
import {
  newRoleContext,
  ROLE_STORAGE_STATE,
} from '@/tests/support/authorization-test-helpers'
import { expectPaintedFocus, tabTo } from '@/tests/support/keyboard-focus'

for (const theme of ['light', 'dark'] as const) {
  for (const palette of ['normal', 'forced-light', 'forced-dark'] as const) {
    test(`A11Y-02: keyboard focus remains visible across navigation and dialogs (${theme}, ${palette})`, async ({
      page,
      request,
    }, testInfo) => {
      await page.emulateMedia({
        forcedColors: palette === 'normal' ? 'none' : 'active',
        colorScheme: palette === 'forced-dark' ? 'dark' : 'light',
        reducedMotion: 'reduce',
      })
      await page.addInitScript(theme => {
        localStorage.setItem('theme', theme)
        localStorage.setItem(
          'requirements.navigationRail.expanded.v1',
          'collapsed',
        )
      }, theme)
      await page.goto('/sv/requirements/new')
      const check = async (
        target: Parameters<typeof tabTo>[1],
        label: string,
        backwards = false,
      ) => {
        await test.step(label, async () => {
          await tabTo(page, target, backwards)
          await expectPaintedFocus(page, target, testInfo, label)
        })
      }
      const rail = page.locator('[data-global-navigation-rail="desktop"]')
      for (const expanded of [false, true]) {
        await check(
          rail.getByRole('link', { name: 'Kravbibliotek', exact: true }),
          `active-navigation-${expanded}`,
        )
        await check(
          rail.locator('a[href="/sv/specifications"]'),
          `inactive-navigation-${expanded}`,
        )
        if (!expanded) {
          await check(
            rail.getByRole('button', { name: 'Expandera navigation' }),
            'expand-navigation',
          )
          await page.keyboard.press('Enter')
          await expect(
            rail.getByRole('button', { name: 'Fäll ihop navigation' }),
          ).toBeVisible()
        }
      }
      const pickerTrigger = page.getByRole('button', { name: 'Välj kravpaket' })
      await check(pickerTrigger, 'open-picker')
      await page.keyboard.press('Enter')
      const picker = page.getByRole('dialog')
      const create = picker.getByRole('button', { name: 'Nytt kravpaket' })
      await check(create, 'create-package')
      await page.keyboard.press('Enter')
      const form = page.getByRole('dialog', {
        name: 'Nytt kravpaket',
        exact: true,
      })
      const close = form.getByRole('button', { name: 'Stäng', exact: true })
      await expect(close).toHaveAttribute('data-developer-mode-value', 'close')
      await form
        .locator('#association-create-packages-name')
        .fill('Keyboard focus draft')
      await form
        .locator('#association-create-packages-purpose')
        .fill('Unsaved focus verification')
      const save = form.getByRole('button', { name: 'Spara', exact: true })
      await check(save, 'primary-save')
      await page.keyboard.press('Tab')
      await expect(close).toBeFocused()
      await expectPaintedFocus(page, close, testInfo, 'form-close')
      await page.keyboard.press('Shift+Tab')
      await expect(save).toBeFocused()
      await check(
        form.getByRole('button', { name: 'Avbryt', exact: true }),
        'form-cancel',
        true,
      )
      await page.keyboard.press('Enter')
      const confirmation = page.getByRole('alertdialog')
      const cancel = confirmation.getByRole('button', {
        name: 'Avbryt',
        exact: true,
      })
      const confirm = confirmation.getByRole('button', {
        name: 'Bekräfta',
        exact: true,
      })
      await expect(cancel).toBeFocused()
      await expect(cancel).toHaveAttribute(
        'data-developer-mode-value',
        'cancel',
      )
      await expectPaintedFocus(page, cancel, testInfo, 'secondary-cancel')
      await check(confirm, 'danger-confirm')
      await expect(confirm).toHaveAttribute(
        'data-developer-mode-value',
        'confirm',
      )
      await page.keyboard.press('Tab')
      await expect(cancel).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(confirm).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(
        form.getByRole('button', { name: 'Avbryt', exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Enter')
      await tabTo(page, confirm)
      await page.keyboard.press('Enter')
      await expect(create).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(pickerTrigger).toBeFocused()

      // Isolated draft exposes the shared destructive action without touching seed data.
      const areasResponse = await request.get('/api/requirement-areas')
      await expectApiResponseOk(areasResponse, 'GET requirement areas')
      const { areas } = await areasResponse.json()
      const response = await request.post('/api/requirements', {
        data: {
          areaId: areas[0].id,
          description: `Keyboard focus ${testInfo.testId}`,
          verifiable: false,
        },
      })
      await expectApiResponseOk(response, 'POST focus draft')
      const { requirement } = await response.json()
      const reviewerRequest = await newRoleContext(testInfo, 'reviewer')
      let inReview = false
      try {
        await page.goto(`/sv/requirements/${requirement.uniqueId}/1`)
        await check(
          page.getByRole('button', { name: 'Ta bort', exact: true }),
          'shared-destructive',
        )
        await testInfo.attach('focused-destructive', {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
        await expectApiResponseOk(
          await request.post(`/api/requirement-transitions/${requirement.id}`, {
            data: { statusId: 2 },
          }),
          'Prepare review requirement',
        )
        inReview = true
        await page.context().setStorageState(ROLE_STORAGE_STATE.reviewer)
        await page.reload()
        const returnToDraft = page.getByRole('button', {
          name: '← Utkast',
          exact: true,
        })
        await tabTo(page, returnToDraft)
        await page.keyboard.press('Enter')
        await expect(confirm).toBeFocused()
        await expectPaintedFocus(page, confirm, testInfo, 'default-confirm')
        await page.keyboard.press('Tab')
        await expect(cancel).toBeFocused()
        await expectPaintedFocus(page, cancel, testInfo, 'default-cancel')
        await page.keyboard.press('Shift+Tab')
        await expect(confirm).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(returnToDraft).toBeFocused()
      } finally {
        if (inReview) {
          await expectApiResponseOk(
            await reviewerRequest.post(
              `/api/requirement-transitions/${requirement.id}`,
              {
                data: { statusId: 1 },
              },
            ),
            'Return focus requirement to draft',
          )
        }
        await expectApiResponseOk(
          await request.post(
            `/api/requirements/${requirement.id}/delete-draft`,
          ),
          'Delete focus draft',
        )
        await reviewerRequest.dispose()
      }
    })
  }
}
