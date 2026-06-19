import { expect, type Locator, test } from '@playwright/test'

const viewports = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 720, name: 'desktop', width: 1280 },
]

function splitHsaId(hsaId: string): { prefix: string; suffix: string } {
  const separatorIndex = hsaId.indexOf('-')
  if (separatorIndex < 0) {
    throw new Error(`Expected full HSA-id with prefix and suffix: ${hsaId}`)
  }

  return {
    prefix: hsaId.slice(0, separatorIndex),
    suffix: hsaId.slice(separatorIndex + 1),
  }
}

async function fillEditableHsaId(
  scope: Locator,
  inputName: string,
  hsaId: string,
): Promise<void> {
  const { prefix, suffix } = splitHsaId(hsaId)
  await scope
    .getByRole('combobox', { name: 'HSA-id-prefix' })
    .selectOption(prefix)
  await scope.getByRole('textbox', { name: inputName }).fill(suffix)
}

for (const viewport of viewports) {
  test.describe(`Requirement packages list filter — ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { height: viewport.height, width: viewport.width } })

    test('filters the table by package name or description and clears the search', async ({
      page,
    }) => {
      await test.step('open the package stewardship list', async () => {
        await page.goto('/sv/requirements/stewardship?tab=packages')

        await expect(page).toHaveTitle(/Kravbiblioteksförvaltning/)
        await expect(
          page.getByRole('heading', { level: 1, name: 'Kravpaket' }),
        ).toHaveText('Kravpaket')
      })

      const nameFilter = page.getByRole('textbox', {
        name: 'Filtrera på namn eller beskrivning',
      })
      const mobilePackage = page.getByRole('cell', {
        exact: true,
        name: 'Mobil användning',
      })
      const ssoPackage = page.getByRole('cell', {
        exact: true,
        name: 'Single Sign-On',
      })

      await test.step('verify the unfiltered table', async () => {
        await expect(nameFilter).toHaveValue('')
        await expect(mobilePackage).toHaveCount(1)
        await expect(ssoPackage).toHaveCount(1)
      })

      if (viewport.name === 'desktop') {
        await test.step('keep the create button anchored to the list', async () => {
          const createButton = page.getByRole('button', {
            name: 'Nytt kravpaket',
          })
          const tableSurface = page.getByRole('table')

          await expect(createButton).toHaveCount(1)
          await expect(tableSurface).toHaveCount(1)

          const buttonBox = await createButton.boundingBox()
          const tableBox = await tableSurface.boundingBox()

          expect(buttonBox).not.toBeNull()
          expect(tableBox).not.toBeNull()
          expect(buttonBox?.x ?? 0).toBeGreaterThan(
            (tableBox?.x ?? 0) + (tableBox?.width ?? 0) - 60,
          )
          expect(
            Math.abs((buttonBox?.y ?? 0) - ((tableBox?.y ?? 0) + 4)),
          ).toBeLessThanOrEqual(12)
        })
      }

      await test.step('filter by a matching package name', async () => {
        await nameFilter.fill('Mobil')

        await expect(mobilePackage).toHaveCount(1)
        await expect(ssoPackage).toHaveCount(0)
      })

      await test.step('filter by a matching package description', async () => {
        await nameFilter.fill('gemensamma inloggning')

        await expect(mobilePackage).toHaveCount(0)
        await expect(ssoPackage).toHaveCount(1)
      })

      await test.step('show the no-results state', async () => {
        await nameFilter.fill('paket som saknas')

        await expect(page.getByText('Inga resultat hittades')).toHaveCount(1)
        await expect(mobilePackage).toHaveCount(0)
      })

      await test.step('clear the search', async () => {
        await page.getByRole('button', { name: 'Rensa sökning' }).click()

        await expect(nameFilter).toHaveValue('')
        await expect(mobilePackage).toHaveCount(1)
        await expect(ssoPackage).toHaveCount(1)
      })

      await test.step('show the signed-in package lead when creating', async () => {
        await page.getByRole('button', { name: 'Nytt kravpaket' }).click()

        const dialog = page.getByRole('dialog', { name: 'Nytt kravpaket' })
        await expect(dialog).toBeVisible()
        const nameInput = dialog.getByRole('textbox', { name: 'Namn' })
        const coAuthorsHeading = dialog.getByRole('heading', {
          name: 'Kravpaketsmedförfattare',
        })

        const leadSummary = dialog.locator(
          'section[aria-labelledby="requirement-package-create-lead-title"]',
        )
        await expect(nameInput).toBeVisible()
        await expect(coAuthorsHeading).toBeVisible()
        await expect(
          dialog.getByText(
            'Du blir kravpaketsansvarig när kravpaketet skapas.',
          ),
        ).toBeVisible()
        await expect(
          dialog.getByRole('textbox', {
            name: 'Kravpaketsansvarigs HSA-id',
          }),
        ).toHaveCount(0)
        await expect(dialog.getByRole('button', { name: 'Hämta' })).toHaveCount(
          0,
        )
        await expect(dialog.getByText(/Ada Admin/)).toBeVisible()
        await expect(dialog.getByText('SE5560000001-admin1')).toBeVisible()
        await expect(dialog.getByText('Kopplade krav')).toHaveCount(0)

        const dialogBox = await dialog.boundingBox()
        const leadBox = await leadSummary.boundingBox()
        const coAuthorsBox = await coAuthorsHeading.boundingBox()
        expect(dialogBox).not.toBeNull()
        expect(leadBox).not.toBeNull()
        expect(coAuthorsBox).not.toBeNull()

        if (viewport.name === 'desktop') {
          expect(dialogBox?.width ?? 0).toBeGreaterThan(800)
          expect(coAuthorsBox?.x ?? 0).toBeGreaterThan(
            (leadBox?.x ?? 0) + (leadBox?.width ?? 0),
          )
        } else {
          expect(coAuthorsBox?.y ?? 0).toBeGreaterThan(
            (leadBox?.y ?? 0) + (leadBox?.height ?? 0),
          )
        }

        await dialog.getByRole('button', { name: 'Stäng' }).click()
        await expect(dialog).toBeHidden()
      })

      await test.step('change package lead through the edit modal', async () => {
        const row = page.getByRole('row', { name: /Mobil användning/ })
        await row.getByRole('button', { name: 'Redigera' }).click()

        const dialog = page.getByRole('dialog', {
          name: 'Redigera kravpaket',
        })
        await expect(dialog).toBeVisible()
        const leadInput = dialog.getByRole('textbox', {
          name: 'Kravpaketsansvarigs HSA-id',
        })
        await expect(leadInput).toHaveAttribute('readonly', '')
        await expect(
          leadInput.locator('xpath=../following-sibling::p'),
        ).toContainText(/\(.+@.+\)/)
        await expect(
          dialog.getByRole('button', { name: 'Byt kravpaketsansvarig' }),
        ).toBeVisible()

        const currentLeadHsaId = await leadInput.inputValue()
        await dialog
          .getByRole('button', { name: 'Byt kravpaketsansvarig' })
          .click()

        const changeDialog = page.getByRole('dialog', {
          name: 'Byt kravpaketsansvarig',
        })
        await expect(changeDialog).toBeVisible()
        await expect(
          changeDialog.getByRole('textbox', {
            name: 'Förra kravpaketsansvarigs HSA-id',
          }),
        ).toHaveValue(currentLeadHsaId)
        const nextLeadInput = changeDialog.getByRole('textbox', {
          name: 'Nya kravpaketsansvarigs HSA-id',
        })
        await expect(nextLeadInput).toBeVisible()
        await expect(
          changeDialog.getByRole('button', { name: 'Hämta' }),
        ).toBeVisible()
        await expect(
          changeDialog.getByRole('textbox', { name: 'Namn' }),
        ).toHaveCount(0)
        await expect(
          changeDialog.getByRole('textbox', { name: 'E-post' }),
        ).toHaveCount(0)
        await expect(changeDialog.getByText('Inte hämtat')).toBeVisible()

        await fillEditableHsaId(
          changeDialog,
          'Nya kravpaketsansvarigs HSA-id',
          'SE5560000001-admin1',
        )
        await nextLeadInput.press('Tab')
        await expect(
          changeDialog.getByText('Ada Admin (ada.admin@example.test)'),
        ).toBeVisible()

        await fillEditableHsaId(
          changeDialog,
          'Nya kravpaketsansvarigs HSA-id',
          'SE5560000001-pkgco1',
        )
        await expect(changeDialog.getByRole('alert')).toContainText(
          'Kravpaketsansvarig kan inte samtidigt vara',
        )
      })
    })
  })
}
